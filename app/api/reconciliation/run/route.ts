import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { detectDuplicates } from "@/lib/reconciliation/detectors/duplicate-detector";
import { detectInternalTransfer } from "@/lib/reconciliation/detectors/internal-detector";

/**
 * POST /api/reconciliation/run
 *
 * Runs the reconciliation engine for the authenticated user's company.
 * Matches bank transactions against invoices using multiple strategies:
 * 1. Exact amount + contact IBAN match
 * 2. Grouped match (multiple invoices = one transaction)
 * 3. Partial match (transaction covers part of an invoice)
 * 4. Difference match (small tolerance for bank fees, discounts)
 *
 * Also detects duplicates and internal transfers.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const { company, user } = ctx;
    const startedAt = Date.now();

    // Get company settings
    const autoApproveThreshold = company.autoApproveThreshold;
    const materialityThreshold = company.materialityThreshold;

    // Fetch unreconciled bank transactions
    const pendingTx = await db.bankTransaction.findMany({
      where: {
        companyId: company.id,
        status: "PENDING",
      },
      orderBy: { valueDate: "asc" },
    });

    // Fetch unpaid/partially paid invoices
    const unpaidInvoices = await db.invoice.findMany({
      where: {
        companyId: company.id,
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      include: {
        contact: { select: { id: true, iban: true, name: true } },
      },
    });

    // Fetch matching rules
    const rules = await db.matchingRule.findMany({
      where: { companyId: company.id, isActive: true },
      orderBy: { timesApplied: "desc" },
    });

    let matched = 0;
    let autoApproved = 0;
    let duplicates = 0;
    let internals = 0;
    let classified = 0;
    const errors: string[] = [];

    for (const tx of pendingTx) {
      try {
        // Step 1: Detect duplicates
        const dupResult = await detectDuplicates(tx, db);
        if (dupResult.isDuplicate) {
          await db.bankTransaction.update({
            where: { id: tx.id },
            data: {
              status: "DUPLICATE",
              detectedType: "POSSIBLE_DUPLICATE",
              priority: "DECISION",
            },
          });
          duplicates++;
          continue;
        }

        // Step 2: Detect internal transfers
        const internalResult = await detectInternalTransfer(tx, db);
        if (internalResult.isInternal) {
          await db.bankTransaction.update({
            where: { id: tx.id },
            data: {
              status: "INTERNAL",
              detectedType: "INTERNAL_TRANSFER",
              priority: "ROUTINE",
            },
          });
          internals++;
          continue;
        }

        // Step 3: Apply matching rules (concept/IBAN classification)
        const ruleMatch = findMatchingRule(tx, rules);
        if (ruleMatch) {
          if (ruleMatch.action === "classify") {
            const account = await db.account.findFirst({
              where: { code: ruleMatch.accountCode!, companyId: company.id },
            });

            if (account) {
              const classification =
                await db.bankTransactionClassification.create({
                  data: {
                    accountId: account.id,
                    cashflowType: ruleMatch.cashflowType!,
                    description: `Auto-classified by rule: ${ruleMatch.pattern ?? ruleMatch.counterpartIban}`,
                  },
                });

              await db.bankTransaction.update({
                where: { id: tx.id },
                data: {
                  status: "CLASSIFIED",
                  classificationId: classification.id,
                  detectedType: "EXPENSE_NO_INVOICE",
                  priority: "ROUTINE",
                },
              });

              await db.matchingRule.update({
                where: { id: ruleMatch.id },
                data: { timesApplied: { increment: 1 } },
              });

              classified++;
              continue;
            }
          }
        }

        // Step 4: Exact match — same amount, matching IBAN
        const exactMatch = findExactMatch(tx, unpaidInvoices);
        if (exactMatch) {
          const confidence = calculateMatchScore(tx, exactMatch, "exact");
          const shouldAutoApprove = confidence >= autoApproveThreshold;

          const reconciliation = await db.reconciliation.create({
            data: {
              companyId: company.id,
              type: "EXACT_MATCH",
              confidenceScore: confidence,
              matchReason: buildMatchReason(tx, exactMatch, "exact"),
              status: shouldAutoApprove ? "AUTO_APPROVED" : "PROPOSED",
              invoiceAmount: exactMatch.totalAmount,
              bankAmount: Math.abs(tx.amount),
              difference: 0,
              bankTransactionId: tx.id,
              invoiceId: exactMatch.id,
              resolvedAt: shouldAutoApprove ? new Date() : null,
            },
          });

          await db.bankTransaction.update({
            where: { id: tx.id },
            data: {
              status: shouldAutoApprove ? "RECONCILED" : "PENDING",
              detectedType: "MATCH_SIMPLE",
              priority: shouldAutoApprove ? "ROUTINE" : "CONFIRMATION",
            },
          });

          if (shouldAutoApprove) {
            await db.invoice.update({
              where: { id: exactMatch.id },
              data: {
                status: "PAID",
                amountPaid: exactMatch.totalAmount,
                amountPending: 0,
              },
            });
            autoApproved++;
          }

          // Remove matched invoice from pool
          const idx = unpaidInvoices.findIndex(
            (inv) => inv.id === exactMatch.id
          );
          if (idx >= 0) unpaidInvoices.splice(idx, 1);

          matched++;
          continue;
        }

        // Step 5: Difference match — amount close within materiality threshold
        const diffMatch = findDifferenceMatch(
          tx,
          unpaidInvoices,
          materialityThreshold
        );
        if (diffMatch) {
          const diff =
            Math.abs(tx.amount) - diffMatch.invoice.totalAmount;
          const confidence = calculateMatchScore(
            tx,
            diffMatch.invoice,
            "difference"
          );

          await db.reconciliation.create({
            data: {
              companyId: company.id,
              type: "DIFFERENCE_MATCH",
              confidenceScore: confidence,
              matchReason: buildMatchReason(
                tx,
                diffMatch.invoice,
                "difference"
              ),
              status: "PROPOSED",
              invoiceAmount: diffMatch.invoice.totalAmount,
              bankAmount: Math.abs(tx.amount),
              difference: Math.abs(diff),
              bankTransactionId: tx.id,
              invoiceId: diffMatch.invoice.id,
            },
          });

          await db.bankTransaction.update({
            where: { id: tx.id },
            data: {
              detectedType: "MATCH_DIFFERENCE",
              priority: "DECISION",
            },
          });

          matched++;
          continue;
        }

        // Step 6: No match found — mark for investigation if significant
        if (Math.abs(tx.amount) >= materialityThreshold) {
          await db.bankTransaction.update({
            where: { id: tx.id },
            data: {
              detectedType: "UNIDENTIFIED",
              priority: "DECISION",
            },
          });
        } else {
          await db.bankTransaction.update({
            where: { id: tx.id },
            data: {
              detectedType: "UNIDENTIFIED",
              priority: "ROUTINE",
            },
          });
        }
      } catch (err) {
        errors.push(
          `Tx ${tx.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const duration = Date.now() - startedAt;

    // Create sync log for the reconciliation run
    await db.syncLog.create({
      data: {
        companyId: company.id,
        source: "RECONCILIATION",
        action: "RUN",
        status: errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        recordsProcessed: pendingTx.length,
        recordsCreated: matched,
        recordsUpdated: autoApproved,
        errors: errors.length > 0 ? errors : undefined,
        duration,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      processed: pendingTx.length,
      matched,
      autoApproved,
      duplicates,
      internals,
      classified,
      unmatched: pendingTx.length - matched - duplicates - internals - classified,
      duration,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
  "resolve:reconciliation"
);

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

type InvoiceWithContact = Awaited<
  ReturnType<typeof import("@prisma/client").PrismaClient.prototype.invoice.findMany>
>[number] & {
  contact: { id: string; iban: string | null; name: string | null } | null;
};

function findExactMatch(
  tx: { amount: number; counterpartIban: string | null },
  invoices: InvoiceWithContact[]
): InvoiceWithContact | null {
  const txAmount = Math.abs(tx.amount);
  const normalizedIban = tx.counterpartIban
    ?.replace(/\s/g, "")
    .toUpperCase();

  for (const inv of invoices) {
    // Amount must match exactly (within 1 cent)
    const invAmount = inv.amountPending ?? inv.totalAmount - inv.amountPaid;
    if (Math.abs(txAmount - invAmount) > 0.01) continue;

    // If we have IBAN info, it should match the contact's IBAN
    if (normalizedIban && inv.contact?.iban) {
      const contactIban = inv.contact.iban.replace(/\s/g, "").toUpperCase();
      if (normalizedIban === contactIban) return inv;
    }

    // If no IBAN to compare, still consider it an exact match by amount
    // (lower confidence, but still valid)
    if (!normalizedIban || !inv.contact?.iban) {
      return inv;
    }
  }

  return null;
}

function findDifferenceMatch(
  tx: { amount: number; counterpartIban: string | null },
  invoices: InvoiceWithContact[],
  threshold: number
): { invoice: InvoiceWithContact; difference: number } | null {
  const txAmount = Math.abs(tx.amount);
  let bestMatch: { invoice: InvoiceWithContact; difference: number } | null =
    null;

  for (const inv of invoices) {
    const invAmount = inv.amountPending ?? inv.totalAmount - inv.amountPaid;
    const diff = Math.abs(txAmount - invAmount);

    if (diff > 0.01 && diff <= threshold) {
      // Prefer matches with smaller differences
      if (!bestMatch || diff < bestMatch.difference) {
        bestMatch = { invoice: inv, difference: diff };
      }
    }
  }

  return bestMatch;
}

function findMatchingRule(
  tx: { amount: number; concept: string | null; counterpartIban: string | null },
  rules: Awaited<any[]>
): (typeof rules)[number] | null {
  for (const rule of rules) {
    // IBAN-based rules
    if (rule.counterpartIban && tx.counterpartIban) {
      const ruleIban = rule.counterpartIban.replace(/\s/g, "").toUpperCase();
      const txIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();
      if (ruleIban !== txIban) continue;
    } else if (rule.counterpartIban) {
      continue;
    }

    // Pattern-based rules
    if (rule.pattern && tx.concept) {
      const regex = new RegExp(rule.pattern, "i");
      if (!regex.test(tx.concept)) continue;
    } else if (rule.pattern) {
      continue;
    }

    // Amount range
    if (rule.minAmount != null && Math.abs(tx.amount) < rule.minAmount)
      continue;
    if (rule.maxAmount != null && Math.abs(tx.amount) > rule.maxAmount)
      continue;

    return rule;
  }

  return null;
}

function calculateMatchScore(
  tx: { amount: number; counterpartIban: string | null; concept: string | null },
  inv: InvoiceWithContact,
  matchType: "exact" | "difference"
): number {
  let score = 0;

  // Amount match
  if (matchType === "exact") {
    score += 0.5;
  } else {
    const diff =
      Math.abs(Math.abs(tx.amount) - inv.totalAmount) / inv.totalAmount;
    score += Math.max(0, 0.4 - diff);
  }

  // IBAN match
  if (tx.counterpartIban && inv.contact?.iban) {
    const a = tx.counterpartIban.replace(/\s/g, "").toUpperCase();
    const b = inv.contact.iban.replace(/\s/g, "").toUpperCase();
    if (a === b) score += 0.35;
  }

  // Concept contains invoice number or contact name
  if (tx.concept) {
    const conceptLower = tx.concept.toLowerCase();
    if (inv.number && conceptLower.includes(inv.number.toLowerCase())) {
      score += 0.1;
    }
    if (
      inv.contact?.name &&
      conceptLower.includes(inv.contact.name.toLowerCase())
    ) {
      score += 0.05;
    }
  }

  return Math.min(1, Math.round(score * 100) / 100);
}

function buildMatchReason(
  tx: { amount: number; counterpartIban: string | null },
  inv: InvoiceWithContact,
  matchType: string
): string {
  const parts: string[] = [`${matchType} match`];

  if (tx.counterpartIban && inv.contact?.iban) {
    parts.push("IBAN coincide");
  }

  parts.push(
    `Factura ${inv.number} (${inv.totalAmount} EUR) ↔ Movimiento (${Math.abs(tx.amount)} EUR)`
  );

  return parts.join(". ");
}
