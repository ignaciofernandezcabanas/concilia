import type { ScopedPrisma } from "@/lib/db-scoped";
import type {
  BankTransaction,
  DetectedType,
  ReconciliationType,
  Invoice,
  Contact,
} from "@prisma/client";

import { detectInternalTransfer } from "./detectors/internal-detector";
import { detectIntercompany } from "./detectors/intercompany-detector";
import { detectDuplicates } from "./detectors/duplicate-detector";
import { detectReturn } from "./detectors/return-detector";
import { detectFinancialOp } from "./detectors/financial-detector";

import { findExactMatch } from "./matchers/exact-match";
import { findGroupedMatch } from "./matchers/grouped-match";
import { findFuzzyMatch } from "./matchers/fuzzy-match";
import { findLlmMatch } from "./matchers/llm-match";

import { classifyByRules } from "./classifiers/rule-classifier";
import { classifyByLlm, type HistoricalClassification } from "./classifiers/llm-classifier";

import { assignPriority } from "./prioritizer";
import { CONCEPT_MAX_LENGTH } from "./constants";
import { generateExplanation } from "./explainer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconciliationResult {
  processed: number;
  matched: number;
  classified: number;
  autoApproved: number;
  needsReview: number;
  errors: Array<{ txId: string; error: string }>;
}

interface MatchOutcome {
  type: ReconciliationType;
  invoiceId: string | null;
  invoiceIds: string[];
  confidence: number;
  matchReason: string;
  difference: number | null;
  differenceReason: string | null;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Runs the full reconciliation pipeline for all PENDING bank transactions
 * belonging to the specified company.
 *
 * For each transaction:
 * 1. Run detectors (internal, duplicate, return, financial)
 * 2. Run matchers (exact -> grouped -> fuzzy -> LLM)
 * 3. Run classifiers (rule-based -> LLM)
 * 4. Assign priority
 * 5. Auto-approve if confidence > threshold AND amount < materiality
 *
 * The engine is idempotent: it checks for existing Reconciliation records
 * before creating new ones and skips already-processed transactions.
 */
export async function runReconciliation(
  db: ScopedPrisma,
  companyId: string
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    processed: 0,
    matched: 0,
    classified: 0,
    autoApproved: 0,
    needsReview: 0,
    errors: [],
  };

  // Load company settings
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const { autoApproveThreshold, materialityThreshold, materialityMinor } = company;

  // Load per-category thresholds (fallback to global)
  const categoryThresholds = await db.categoryThreshold.findMany({
    where: { companyId },
  });
  const categoryThresholdMap = new Map(categoryThresholds.map((ct) => [ct.category, ct.threshold]));
  const getThreshold = (category: string) =>
    categoryThresholdMap.get(category) ?? autoApproveThreshold;

  // Load all PENDING bank transactions
  const pendingTx = await db.bankTransaction.findMany({
    where: {
      companyId,
      status: "PENDING",
    },
    orderBy: { valueDate: "asc" },
  });

  if (pendingTx.length === 0) {
    return result;
  }

  // Preload data shared across transactions
  const contacts = await db.contact.findMany({
    where: { companyId },
  });

  const pendingInvoices = await db.invoice.findMany({
    where: {
      companyId,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    include: { contact: true },
  });

  // Load historical classifications for LLM classifier context
  const historicalClassifications = await loadHistoricalClassifications(db, companyId);

  // Process each transaction
  for (const tx of pendingTx) {
    try {
      await processTransaction(
        db,
        tx,
        companyId,
        contacts,
        pendingInvoices,
        historicalClassifications,
        autoApproveThreshold,
        materialityThreshold,
        materialityMinor,
        getThreshold,
        result
      );
      result.processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[reconciliation] Error processing tx ${tx.id}:`, message);
      result.errors.push({ txId: tx.id, error: message });
      result.processed++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Per-transaction processing
// ---------------------------------------------------------------------------

async function processTransaction(
  db: ScopedPrisma,
  tx: BankTransaction,
  companyId: string,
  contacts: Contact[],
  pendingInvoices: (Invoice & { contact: Contact | null })[],
  historicalClassifications: HistoricalClassification[],
  autoApproveThreshold: number,
  materialityThreshold: number,
  materialityMinor: number,
  getThreshold: (category: string) => number,
  result: ReconciliationResult
): Promise<void> {
  // Idempotency: skip if a non-rejected reconciliation already exists
  const existing = await db.reconciliation.findFirst({
    where: {
      bankTransactionId: tx.id,
      status: { notIn: ["REJECTED"] },
    },
  });

  if (existing) {
    return;
  }

  // =====================================================================
  // PHASE 1: DETECTORS
  // =====================================================================

  // 1a. Internal transfer
  const internalResult = await detectInternalTransfer(tx, db);
  if (internalResult.isInternal) {
    await createReconciliation(db, tx, companyId, {
      type: "MANUAL",
      confidence: 0.99,
      matchReason: `internal_transfer:${internalResult.ownAccountId}`,
      detectedType: "INTERNAL_TRANSFER",
      autoApprove: true,
    });
    await updateTxStatus(db, tx.id, "INTERNAL", "INTERNAL_TRANSFER", "ROUTINE");
    result.matched++;
    result.autoApproved++;
    return;
  }

  // 1a2. Intercompany transfer (sibling company in same org)
  const intercoResult = await detectIntercompany(tx, companyId);
  if (intercoResult.isIntercompany) {
    await createReconciliation(db, tx, companyId, {
      type: "MANUAL",
      confidence: 0.95,
      matchReason: `intercompany:${intercoResult.siblingCompanyId}:${intercoResult.siblingCompanyName}`,
      detectedType: "INTERCOMPANY",
      autoApprove: false,
    });
    await updateTxStatus(db, tx.id, "PENDING", "INTERCOMPANY", "DECISION");

    // Create IntercompanyLink
    await db.intercompanyLink.create({
      data: {
        amount: Math.abs(tx.amount),
        date: tx.valueDate,
        concept: tx.conceptParsed ?? tx.concept,
        status: "DETECTED",
        companyAId: companyId,
        companyBId: intercoResult.siblingCompanyId!,
        transactionAId: tx.id,
        organizationId: intercoResult.organizationId!,
      },
    });

    result.needsReview++;
    return;
  }

  // 1b. Duplicate detection
  const duplicateResult = await detectDuplicates(tx, db);
  if (duplicateResult.isDuplicate) {
    await createReconciliation(db, tx, companyId, {
      type: "MANUAL",
      confidence: 0.9,
      matchReason: `possible_duplicate:group_${duplicateResult.groupId}`,
      detectedType: "POSSIBLE_DUPLICATE",
      autoApprove: false,
    });
    await updateTxStatus(db, tx.id, "PENDING", "POSSIBLE_DUPLICATE", "URGENT");
    result.needsReview++;
    return;
  }

  // 1c. Return detection
  const returnResult = await detectReturn(tx, db);
  if (returnResult.isReturn) {
    await createReconciliation(db, tx, companyId, {
      type: "RETURN_MATCH",
      confidence: 0.95,
      matchReason: `return:original_tx_${returnResult.originalTxId}`,
      detectedType: "RETURN",
      autoApprove: false,
    });
    await updateTxStatus(db, tx.id, "PENDING", "RETURN", "URGENT");
    result.needsReview++;
    return;
  }

  // =====================================================================
  // PHASE 1d: CREDIT NOTE DETECTION
  // =====================================================================

  if (tx.amount > 0) {
    // Positive amount could be a credit note refund — check for CREDIT_ISSUED invoices
    const creditNotes = pendingInvoices.filter(
      (inv) => inv.type === "CREDIT_ISSUED" && Math.abs(inv.totalAmount - tx.amount) < 0.01
    );
    if (creditNotes.length === 1) {
      const cn = creditNotes[0];
      await createReconciliation(db, tx, companyId, {
        type: "CREDIT_NOTE_MATCH",
        confidence: 0.95,
        matchReason: `credit_note:${cn.number}:exact_amount`,
        detectedType: "CREDIT_NOTE",
        invoiceId: cn.id,
        autoApprove: 0.95 >= autoApproveThreshold && Math.abs(tx.amount) <= materialityThreshold,
      });
      const shouldAuto =
        0.95 >= autoApproveThreshold && Math.abs(tx.amount) <= materialityThreshold;
      await updateTxStatus(
        db,
        tx.id,
        shouldAuto ? "RECONCILED" : "PENDING",
        "CREDIT_NOTE",
        shouldAuto ? "ROUTINE" : "CONFIRMATION"
      );
      if (shouldAuto) {
        await markInvoicePaid(db, cn.id, tx.amount);
        // Link credit note to original invoice (reverse the payment)
        if (cn.creditNoteForId) {
          await markInvoicePaid(db, cn.creditNoteForId, -Math.abs(cn.totalAmount));
        }
        result.autoApproved++;
      } else {
        result.needsReview++;
      }
      result.matched++;
      return;
    }
  }
  // Negative amount → CREDIT_RECEIVED
  if (tx.amount < 0) {
    const creditNotes = pendingInvoices.filter(
      (inv) =>
        inv.type === "CREDIT_RECEIVED" && Math.abs(inv.totalAmount - Math.abs(tx.amount)) < 0.01
    );
    if (creditNotes.length === 1) {
      const cn = creditNotes[0];
      await createReconciliation(db, tx, companyId, {
        type: "CREDIT_NOTE_MATCH",
        confidence: 0.95,
        matchReason: `credit_note:${cn.number}:exact_amount`,
        detectedType: "CREDIT_NOTE",
        invoiceId: cn.id,
        autoApprove: 0.95 >= autoApproveThreshold && Math.abs(tx.amount) <= materialityThreshold,
      });
      const shouldAuto =
        0.95 >= autoApproveThreshold && Math.abs(tx.amount) <= materialityThreshold;
      await updateTxStatus(
        db,
        tx.id,
        shouldAuto ? "RECONCILED" : "PENDING",
        "CREDIT_NOTE",
        shouldAuto ? "ROUTINE" : "CONFIRMATION"
      );
      if (shouldAuto) {
        await markInvoicePaid(db, cn.id, Math.abs(tx.amount));
        result.autoApproved++;
      } else {
        result.needsReview++;
      }
      result.matched++;
      return;
    }
  }

  // =====================================================================
  // PHASE 2: MATCHERS
  // =====================================================================

  let matchOutcome: MatchOutcome | null = null;

  // 2a. Exact match
  const exactMatches = await findExactMatch(tx, db);
  if (exactMatches.length > 0) {
    const best = exactMatches[0];
    matchOutcome = {
      type: "EXACT_MATCH",
      invoiceId: best.invoice.id,
      invoiceIds: [best.invoice.id],
      confidence: best.confidence,
      matchReason: best.matchReason,
      difference: null,
      differenceReason: null,
    };
  }

  // 2a-bis. Partial payment detection (amount < invoice but same contact)
  if (!matchOutcome) {
    const absTxAmount = Math.abs(tx.amount);
    const isIncome = tx.amount > 0;
    const partialCandidates = pendingInvoices.filter((inv) => {
      const matchType = isIncome
        ? inv.type === "ISSUED" || inv.type === "CREDIT_RECEIVED"
        : inv.type === "RECEIVED" || inv.type === "CREDIT_ISSUED";
      if (!matchType) return false;
      // Amount must be less than invoice but > 10% of it
      const pending = inv.amountPending ?? inv.totalAmount;
      return absTxAmount < pending && absTxAmount > pending * 0.1;
    });

    // Try to match by IBAN or CIF
    for (const inv of partialCandidates) {
      const contact = inv.contact;
      if (!contact) continue;
      const ibanMatch =
        contact.iban &&
        tx.counterpartIban &&
        contact.iban.replace(/\s/g, "") === tx.counterpartIban.replace(/\s/g, "");
      const cifMatch =
        contact.cif && tx.concept && tx.concept.toUpperCase().includes(contact.cif.toUpperCase());
      if (ibanMatch || cifMatch) {
        matchOutcome = {
          type: "PARTIAL_MATCH",
          invoiceId: inv.id,
          invoiceIds: [inv.id],
          confidence: ibanMatch ? 0.88 : 0.75,
          matchReason: `partial_payment:${absTxAmount}/${inv.amountPending ?? inv.totalAmount}:${ibanMatch ? "iban" : "cif"}`,
          difference: absTxAmount - (inv.amountPending ?? inv.totalAmount),
          differenceReason: "PARTIAL_PAYMENT",
        };
        break;
      }
    }
  }

  // 2b. Grouped match (only if no exact match)
  if (!matchOutcome) {
    const grouped = await findGroupedMatch(tx, db);
    if (grouped) {
      matchOutcome = {
        type: "GROUPED_MATCH",
        invoiceId: grouped.invoices[0]?.id ?? null,
        invoiceIds: grouped.invoices.map((inv) => inv.id),
        confidence: grouped.confidence,
        matchReason: grouped.matchReason,
        difference: null,
        differenceReason: null,
      };
    }
  }

  // 2b-bis. Check learned patterns for difference reason prediction
  // If we have a fuzzy match, check if a learned pattern suggests the reason
  if (!matchOutcome) {
    // First check if a learned pattern can resolve this directly
    const learnedPatterns = await db.learnedPattern.findMany({
      where: {
        companyId,
        isActive: true,
        counterpartIban: tx.counterpartIban ?? "none",
        confidence: { gte: 0.8 },
      },
      orderBy: { confidence: "desc" },
      take: 1,
    });

    if (learnedPatterns.length > 0) {
      const pattern = learnedPatterns[0];
      // Find the matching invoice using the pattern's predicted action
      const candidates = pendingInvoices.filter((inv) => {
        const isMatch =
          tx.amount > 0
            ? inv.type === "ISSUED" || inv.type === "CREDIT_RECEIVED"
            : inv.type === "RECEIVED" || inv.type === "CREDIT_ISSUED";
        return isMatch && inv.contact?.iban === tx.counterpartIban;
      });

      if (candidates.length > 0) {
        const best = candidates[0];
        const diff = Math.abs(tx.amount) - best.totalAmount;
        if (Math.abs(diff) < best.totalAmount * 0.1) {
          matchOutcome = {
            type: "DIFFERENCE_MATCH",
            invoiceId: best.id,
            invoiceIds: [best.id],
            confidence: Math.min(pattern.confidence, 0.9),
            matchReason: `learned_pattern:${pattern.id}:${pattern.predictedReason}`,
            difference: diff,
            differenceReason: pattern.predictedReason,
          };
          // Increment pattern usage
          try {
            await db.learnedPattern.update({
              where: { id: pattern.id },
              data: { occurrences: { increment: 1 }, supervisedApplyCount: { increment: 1 } },
            });
          } catch (err) {
            console.warn(
              "[learning] Failed to increment pattern usage:",
              err instanceof Error ? err.message : err
            );
          }
        }
      }
    }
  }

  // 2c. Fuzzy match (only if no match found yet)
  if (!matchOutcome) {
    const fuzzyMatches = await findFuzzyMatch(tx, db);
    if (fuzzyMatches.length > 0) {
      const best = fuzzyMatches[0];
      matchOutcome = {
        type: "DIFFERENCE_MATCH",
        invoiceId: best.invoice.id,
        invoiceIds: [best.invoice.id],
        confidence: best.confidence,
        matchReason: best.matchReason,
        difference: best.amountDifference,
        differenceReason: best.suggestedDifferenceReason,
      };
    }
  }

  // 2d. LLM match (only if no other match found)
  if (!matchOutcome) {
    const llmResult = await findLlmMatch(tx, pendingInvoices, contacts, db);
    if (llmResult) {
      matchOutcome = {
        type: "EXACT_MATCH",
        invoiceId: llmResult.invoiceId,
        invoiceIds: [llmResult.invoiceId],
        confidence: llmResult.confidence,
        matchReason: `${llmResult.matchReason}:${llmResult.llmExplanation}`,
        difference: null,
        differenceReason: null,
      };
    }
  }

  // If a match was found, create reconciliation(s)
  if (matchOutcome) {
    const detectedType = resolveDetectedType(matchOutcome);
    const priority = assignPriority(
      tx,
      detectedType,
      matchOutcome.confidence,
      materialityThreshold
    );

    // Auto-approve rules:
    // 1. Standard: confidence >= category threshold AND amount <= materiality
    // 2. Small difference: if |difference| <= materialityMinor AND confidence >= 0.70
    // 3. Unidentified income (scenario 8) → NEVER auto-approve
    // 4. First-time classification → NEVER auto-approve
    const categoryKey = matchOutcome.type; // "EXACT_MATCH", "GROUPED_MATCH", etc.
    const categoryThreshold = getThreshold(categoryKey);

    const isSmallDiff =
      matchOutcome.difference != null &&
      Math.abs(matchOutcome.difference) <= materialityMinor &&
      matchOutcome.confidence >= 0.7;

    const isUnidentifiedIncome = !matchOutcome.invoiceId && tx.amount > 0;

    const shouldAutoApprove =
      !isUnidentifiedIncome &&
      ((matchOutcome.confidence >= categoryThreshold &&
        Math.abs(tx.amount) <= materialityThreshold) ||
        isSmallDiff);

    // For grouped matches, create a reconciliation per invoice
    if (matchOutcome.type === "GROUPED_MATCH" && matchOutcome.invoiceIds.length > 1) {
      for (const invoiceId of matchOutcome.invoiceIds) {
        await createReconciliation(db, tx, companyId, {
          type: matchOutcome.type,
          confidence: matchOutcome.confidence,
          matchReason: matchOutcome.matchReason,
          detectedType,
          invoiceId,
          difference: matchOutcome.difference,
          differenceReason: matchOutcome.differenceReason,
          autoApprove: shouldAutoApprove,
        });
      }
    } else {
      await createReconciliation(db, tx, companyId, {
        type: matchOutcome.type,
        confidence: matchOutcome.confidence,
        matchReason: matchOutcome.matchReason,
        detectedType,
        invoiceId: matchOutcome.invoiceId,
        difference: matchOutcome.difference,
        differenceReason: matchOutcome.differenceReason,
        autoApprove: shouldAutoApprove,
      });
    }

    const newTxStatus = shouldAutoApprove ? "RECONCILED" : "PENDING";
    await updateTxStatus(db, tx.id, newTxStatus, detectedType, priority);

    // Update invoice payment status if auto-approved
    if (shouldAutoApprove && matchOutcome.invoiceId) {
      await markInvoicePaid(db, matchOutcome.invoiceId, Math.abs(tx.amount));
    }

    // LEARNING LOOP: create a rule from auto-approved exact matches
    if (shouldAutoApprove && matchOutcome.type === "EXACT_MATCH" && tx.counterpartIban) {
      await learnFromApproval(db, tx, companyId, matchOutcome);
    }

    result.matched++;
    if (shouldAutoApprove) {
      result.autoApproved++;
    } else {
      result.needsReview++;

      // Generate explanation for bandeja (fire-and-forget — non-blocking)
      const invoiceForExplain = matchOutcome.invoiceId
        ? (pendingInvoices.find((i) => i.id === matchOutcome!.invoiceId) ?? null)
        : null;
      generateExplanation({
        tx,
        reconciliation: {
          type: matchOutcome.type,
          confidenceScore: matchOutcome.confidence,
          matchReason: matchOutcome.matchReason,
          difference: matchOutcome.difference,
          differenceReason: matchOutcome.differenceReason,
        },
        invoice: invoiceForExplain
          ? {
              number: invoiceForExplain.number,
              totalAmount: invoiceForExplain.totalAmount,
              contactName: invoiceForExplain.contact?.name ?? "Desconocido",
              dueDate: invoiceForExplain.dueDate?.toISOString().slice(0, 10) ?? null,
            }
          : null,
        threshold: categoryThreshold,
        materialityThreshold,
      })
        .then(async (explanation) => {
          if (explanation) {
            await db.reconciliation.updateMany({
              where: { bankTransactionId: tx.id, companyId, status: "PROPOSED" },
              data: { resolution: explanation },
            });
          }
        })
        .catch((err) => {
          console.warn("[explainer] Failed:", err instanceof Error ? err.message : err);
        });
    }
    return;
  }

  // =====================================================================
  // PHASE 3: CLASSIFIERS (no invoice match found)
  // =====================================================================

  // 3a. Financial operation detection
  const financialResult = await detectFinancialOp(tx, db);
  if (financialResult.isFinancial) {
    await createReconciliation(db, tx, companyId, {
      type: "MANUAL",
      confidence: 0.85,
      matchReason: `financial_op:principal_${financialResult.suggestedPrincipal}_interest_${financialResult.suggestedInterest}`,
      detectedType: "FINANCIAL_OPERATION",
      autoApprove: false,
    });
    await updateTxStatus(db, tx.id, "PENDING", "FINANCIAL_OPERATION", "CONFIRMATION");
    result.classified++;
    result.needsReview++;
    return;
  }

  // 3b. Rule-based classification
  const ruleResult = await classifyByRules(tx, db);
  if (ruleResult) {
    // Resolve the account to get its ID
    const account = await db.account.findFirst({
      where: { code: ruleResult.accountCode, companyId },
    });

    if (account) {
      const classification = await db.bankTransactionClassification.create({
        data: {
          accountId: account.id,
          cashflowType: ruleResult.cashflowType,
          description: `Rule: ${ruleResult.ruleName}`,
        },
      });

      const shouldAutoApprove =
        ruleResult.confidence >= autoApproveThreshold &&
        Math.abs(tx.amount) <= materialityThreshold;

      const priority = assignPriority(
        tx,
        "EXPENSE_NO_INVOICE",
        ruleResult.confidence,
        materialityThreshold
      );

      await db.bankTransaction.update({
        where: { id: tx.id },
        data: {
          classificationId: classification.id,
          status: shouldAutoApprove ? "CLASSIFIED" : "PENDING",
          detectedType: "EXPENSE_NO_INVOICE",
          priority,
        },
      });

      await createReconciliation(db, tx, companyId, {
        type: "MANUAL",
        confidence: ruleResult.confidence,
        matchReason: `rule:${ruleResult.ruleId}:${ruleResult.ruleName}`,
        detectedType: "EXPENSE_NO_INVOICE",
        autoApprove: shouldAutoApprove,
      });

      result.classified++;
      if (shouldAutoApprove) {
        result.autoApproved++;
      } else {
        result.needsReview++;
      }
      return;
    }
  }

  // 3c. LLM classification
  const llmClassification = await classifyByLlm(tx, historicalClassifications);
  if (llmClassification) {
    const account = await db.account.findFirst({
      where: { code: llmClassification.accountCode, companyId },
    });

    if (account) {
      const classification = await db.bankTransactionClassification.create({
        data: {
          accountId: account.id,
          cashflowType: llmClassification.cashflowType,
          description: `LLM: ${llmClassification.llmExplanation}`,
        },
      });

      const priority = assignPriority(
        tx,
        "EXPENSE_NO_INVOICE",
        llmClassification.confidence,
        materialityThreshold
      );

      // LLM classifications always require human review
      await db.bankTransaction.update({
        where: { id: tx.id },
        data: {
          classificationId: classification.id,
          detectedType: "EXPENSE_NO_INVOICE",
          priority,
        },
      });

      await createReconciliation(db, tx, companyId, {
        type: "MANUAL",
        confidence: llmClassification.confidence,
        matchReason: `llm_classify:${llmClassification.accountCode}:${llmClassification.llmExplanation}`,
        detectedType: "EXPENSE_NO_INVOICE",
        autoApprove: false,
      });

      result.classified++;
      result.needsReview++;
      return;
    }
  }

  // =====================================================================
  // PHASE 4: UNIDENTIFIED
  // =====================================================================

  const priority = assignPriority(tx, "UNIDENTIFIED", 0, materialityThreshold);

  await updateTxStatus(db, tx.id, "PENDING", "UNIDENTIFIED", priority);

  await createReconciliation(db, tx, companyId, {
    type: "MANUAL",
    confidence: 0,
    matchReason: "unidentified",
    detectedType: "UNIDENTIFIED",
    autoApprove: false,
  });

  result.needsReview++;

  // Generate explanation for unidentified items (fire-and-forget)
  generateExplanation({
    tx,
    reconciliation: {
      type: "MANUAL",
      confidenceScore: 0,
      matchReason: "unidentified",
      difference: null,
      differenceReason: null,
    },
    invoice: null,
    threshold: autoApproveThreshold,
    materialityThreshold,
  })
    .then(async (explanation) => {
      if (explanation) {
        await db.reconciliation.updateMany({
          where: { bankTransactionId: tx.id, companyId, status: "PROPOSED" },
          data: { resolution: explanation },
        });
      }
    })
    .catch((err) => {
      console.warn("[explainer] Failed:", err instanceof Error ? err.message : err);
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CreateRecoParams {
  type: ReconciliationType;
  confidence: number;
  matchReason: string;
  detectedType: DetectedType;
  invoiceId?: string | null;
  difference?: number | null;
  differenceReason?: string | null;
  autoApprove: boolean;
}

async function createReconciliation(
  db: ScopedPrisma,
  tx: BankTransaction,
  companyId: string,
  params: CreateRecoParams
): Promise<void> {
  const invoiceAmount = params.invoiceId
    ? ((
        await db.invoice.findUnique({
          where: { id: params.invoiceId },
          select: { totalAmount: true },
        })
      )?.totalAmount ?? null)
    : null;

  await db.reconciliation.create({
    data: {
      type: params.type,
      confidenceScore: params.confidence,
      matchReason: params.matchReason,
      status: params.autoApprove ? "AUTO_APPROVED" : "PROPOSED",
      bankTransactionId: tx.id,
      invoiceId: params.invoiceId ?? null,
      companyId,
      invoiceAmount,
      bankAmount: Math.abs(tx.amount),
      difference: params.difference ?? null,
      differenceReason:
        (params.differenceReason as import("@prisma/client").DifferenceReason | null) ?? null,
      ...(params.autoApprove ? { resolvedAt: new Date() } : {}),
    },
  });
}

async function updateTxStatus(
  db: ScopedPrisma,
  txId: string,
  status: BankTransaction["status"],
  detectedType: DetectedType,
  priority: BankTransaction["priority"]
): Promise<void> {
  await db.bankTransaction.update({
    where: { id: txId },
    data: { status, detectedType, priority },
  });
}

function resolveDetectedType(match: MatchOutcome): DetectedType {
  switch (match.type) {
    case "EXACT_MATCH":
      return "MATCH_SIMPLE";
    case "GROUPED_MATCH":
      return "MATCH_GROUPED";
    case "PARTIAL_MATCH":
      return "MATCH_PARTIAL";
    case "DIFFERENCE_MATCH":
      return "MATCH_DIFFERENCE";
    case "RETURN_MATCH":
      return "RETURN";
    case "CREDIT_NOTE_MATCH":
      return "CREDIT_NOTE";
    case "MANUAL":
      return "UNIDENTIFIED";
    default:
      return "UNIDENTIFIED";
  }
}

/**
 * Update invoice payment status after a match is approved.
 * Uses the unified function but wraps it for non-transactional context.
 */
async function markInvoicePaid(
  db: ScopedPrisma,
  invoiceId: string,
  paidAmount: number
): Promise<void> {
  const { updateInvoicePaymentStatus } = await import("./invoice-payments");
  // In the engine, we're not inside a $transaction, so we pass prisma directly
  // The unified function accepts any Prisma-like client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateInvoicePaymentStatus(invoiceId, paidAmount, db as any);
}

/**
 * LEARNING LOOP: create or increment a MatchingRule from an auto-approved match.
 * This teaches the system to auto-approve similar transactions in the future.
 */
async function learnFromApproval(
  db: ScopedPrisma,
  tx: BankTransaction,
  companyId: string,
  match: MatchOutcome
): Promise<void> {
  try {
    // Check if a rule already exists for this IBAN + amount pattern
    const existingRule = await db.matchingRule.findFirst({
      where: {
        companyId,
        counterpartIban: tx.counterpartIban,
        type: "EXACT_AMOUNT_CONTACT",
        isActive: true,
      },
    });

    if (existingRule) {
      // Increment usage counter
      await db.matchingRule.update({
        where: { id: existingRule.id },
        data: { timesApplied: { increment: 1 } },
      });
    } else {
      // Create new rule from this successful match
      await db.matchingRule.create({
        data: {
          type: "EXACT_AMOUNT_CONTACT",
          isActive: true,
          pattern: tx.concept?.slice(0, CONCEPT_MAX_LENGTH) ?? null,
          counterpartIban: tx.counterpartIban,
          action: "auto_approve",
          companyId,
        },
      });
    }
  } catch (err) {
    console.warn(
      "[learning] Failed to learn from approval:",
      err instanceof Error ? err.message : err
    );
  }
}

async function loadHistoricalClassifications(
  db: ScopedPrisma,
  companyId: string
): Promise<HistoricalClassification[]> {
  const classified = await db.bankTransaction.findMany({
    where: {
      companyId,
      status: "CLASSIFIED",
      classificationId: { not: null },
    },
    include: {
      classification: {
        include: { account: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return classified
    .filter((tx) => tx.classification?.account)
    .map((tx) => ({
      concept: tx.concept ?? "",
      accountCode: tx.classification!.account.code,
      accountName: tx.classification!.account.name,
      cashflowType: tx.classification!.cashflowType,
      amount: tx.amount,
    }));
}
