/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified reconciliation resolver.
 *
 * ALL resolution logic lives here. The API route handler delegates to this
 * module and does NOT contain any business logic or direct Prisma writes.
 *
 * Every mutation runs inside a single Prisma $transaction for data consistency.
 */

import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: $transaction requires raw Prisma client
import { updateInvoicePaymentStatus } from "./invoice-payments";
import { trackControllerDecision } from "./decision-tracker";
import { calibrateFromDecision } from "@/lib/ai/confidence-calibrator";
import type { ActionCategory } from "@/lib/ai/confidence-engine";
import type {
  BankTransactionStatus,
  ReconciliationStatus,
  CashflowType,
  DifferenceReason,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolveAction =
  | "approve"
  | "reject"
  | "investigate"
  | "manual_match"
  | "classify"
  | "mark_internal"
  | "mark_intercompany"
  | "mark_duplicate"
  | "mark_legitimate"
  | "mark_return"
  | "ignore"
  | "split_financial"
  | "register_fixed_asset"
  | "register_investment";

export interface ResolvePayload {
  action: ResolveAction;
  reconciliationId?: string;

  // For manual_match
  bankTransactionId?: string;
  invoiceId?: string;
  differenceReason?: DifferenceReason;
  differenceAccountId?: string;
  differenceType?: string;

  // For classify
  accountCode?: string;
  cashflowType?: CashflowType;
  description?: string;

  // For reject / ignore
  reason?: string;

  // For mark_duplicate
  duplicateOfId?: string;

  // For mark_legitimate
  duplicateGroupId?: string;

  // For mark_intercompany
  intercompanyLinkId?: string;
  intercompanyAction?: "confirm" | "eliminate";

  // For split_financial
  principalAmount?: number;
  interestAmount?: number;

  // For register_fixed_asset (scenario 19)
  assetData?: {
    name: string;
    acquisitionCost: number;
    usefulLifeMonths: number;
    residualValue?: number;
    assetAccountCode: string;
    depreciationAccountCode?: string;
    accumDepAccountCode?: string;
  };

  // For register_investment (scenario 20)
  investmentData?: {
    name: string;
    type: string;
    pgcAccount: string;
    acquisitionCost: number;
    isinCif?: string;
    ownershipPct?: number;
  };

  // Rule creation
  createRule?: boolean;
  rulePattern?: string;

  // Note
  note?: string;
}

export interface ResolveResult {
  success: boolean;
  action: string;
  reconciliationId?: string;
  bankTransactionId?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export async function resolveItem(
  payload: ResolvePayload,
  userId: string,
  companyId: string,
  db?: import("@/lib/db-scoped").ScopedPrisma
): Promise<ResolveResult> {
  const { action } = payload;

  // Capture tx data before $transaction for calibration pattern key
  let txForCalibration: {
    counterpartIban: string | null;
    concept: string | null;
    matchReason: string | null;
  } | null = null;
  if (payload.reconciliationId) {
    const reco = await prisma.reconciliation.findFirst({
      where: { id: payload.reconciliationId, companyId },
      include: { bankTransaction: { select: { counterpartIban: true, concept: true } } },
    });
    if (reco) {
      txForCalibration = {
        counterpartIban: reco.bankTransaction?.counterpartIban ?? null,
        concept: reco.bankTransaction?.concept ?? null,
        matchReason: reco.matchReason,
      };
    }
  } else if (payload.bankTransactionId) {
    const btx = await prisma.bankTransaction.findFirst({
      where: { id: payload.bankTransactionId, companyId },
      select: { counterpartIban: true, concept: true },
    });
    if (btx) {
      txForCalibration = {
        counterpartIban: btx.counterpartIban,
        concept: btx.concept,
        matchReason: null,
      };
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    switch (action) {
      // ─── APPROVE ───
      case "approve": {
        const reco = await tx.reconciliation.findFirstOrThrow({
          where: { id: payload.reconciliationId!, companyId },
          include: { bankTransaction: true, invoice: true },
        });

        await tx.reconciliation.update({
          where: { id: reco.id },
          data: { status: "APPROVED", resolvedAt: new Date(), resolvedById: userId },
        });

        if (reco.bankTransactionId) {
          await tx.bankTransaction.update({
            where: { id: reco.bankTransactionId },
            data: { status: "RECONCILED" },
          });
        }

        if (reco.invoice) {
          await updateInvoicePaymentStatus(
            reco.invoice.id,
            reco.bankAmount ?? Math.abs(reco.bankTransaction?.amount ?? 0),
            tx
          );
        }

        // Negative feedback: deactivate bad rules on approve with changes
        // (handled externally since approve = no correction)

        await createAuditLog(tx, userId, "reconciliation.approve", "Reconciliation", reco.id, {
          bankTransactionId: reco.bankTransactionId,
          invoiceId: reco.invoiceId,
        });

        return { success: true, action, reconciliationId: reco.id, message: "Match approved." };
      }

      // ─── REJECT ───
      case "reject": {
        const reco = await tx.reconciliation.findFirstOrThrow({
          where: { id: payload.reconciliationId!, companyId },
        });

        await tx.reconciliation.update({
          where: { id: reco.id },
          data: {
            status: "REJECTED" as ReconciliationStatus,
            resolvedAt: new Date(),
            resolvedById: userId,
            resolution: payload.reason ?? null,
          },
        });

        if (reco.bankTransactionId) {
          await tx.bankTransaction.update({
            where: { id: reco.bankTransactionId },
            data: { status: "PENDING" as BankTransactionStatus },
          });
        }

        // Negative feedback: deactivate the rule that created this bad match
        if (reco.matchReason?.startsWith("rule:")) {
          const ruleId = reco.matchReason.split(":")[1];
          if (ruleId) {
            await tx.matchingRule
              .update({ where: { id: ruleId }, data: { isActive: false } })
              .catch((err) =>
                console.warn(
                  "[resolver] Non-critical operation failed:",
                  err instanceof Error ? err.message : err
                )
              );
          }
        }

        await createAuditLog(tx, userId, "reconciliation.reject", "Reconciliation", reco.id, {
          reason: payload.reason,
        });

        return { success: true, action, reconciliationId: reco.id, message: "Match rejected." };
      }

      // ─── INVESTIGATE ───
      case "investigate": {
        const reco = await tx.reconciliation.findFirstOrThrow({
          where: { id: payload.reconciliationId!, companyId },
        });

        await tx.reconciliation.update({
          where: { id: reco.id },
          data: {
            status: "REJECTED" as ReconciliationStatus,
            resolvedAt: new Date(),
            resolvedById: userId,
            resolution: payload.note ?? "Under investigation",
          },
        });

        if (reco.bankTransactionId) {
          await tx.bankTransaction.update({
            where: { id: reco.bankTransactionId },
            data: {
              status: "INVESTIGATING" as BankTransactionStatus,
              note: payload.note,
              noteAuthorId: userId,
              noteCreatedAt: new Date(),
            },
          });
        }

        // Notify admins
        const admins = await tx.user.findMany({
          where: { companyId, role: "ADMIN", status: "ACTIVE" },
          select: { id: true },
        });
        if (admins.length > 0) {
          await tx.notification.createMany({
            data: admins.map((a) => ({
              type: "RECONCILIATION" as const,
              title: "Transacción en investigación",
              body: payload.note ?? "Una transacción ha sido marcada para investigación.",
              userId: a.id,
              companyId,
            })),
          });
        }

        await createAuditLog(tx, userId, "reconciliation.investigate", "Reconciliation", reco.id, {
          note: payload.note,
        });

        return {
          success: true,
          action,
          reconciliationId: reco.id,
          message: "Flagged for investigation.",
        };
      }

      // ─── MANUAL MATCH ───
      case "manual_match": {
        const [bankTx, invoice] = await Promise.all([
          tx.bankTransaction.findFirstOrThrow({
            where: { id: payload.bankTransactionId!, companyId },
          }),
          tx.invoice.findFirstOrThrow({ where: { id: payload.invoiceId!, companyId } }),
        ]);

        const txAbs = Math.abs(bankTx.amount);
        const diff = txAbs - invoice.totalAmount; // positive = overpaid, negative = underpaid
        const absDiff = Math.abs(diff);
        const AUTO_JUSTIFY_THRESHOLD = 5; // €5

        // If difference > threshold and no differenceType provided → error
        if (absDiff > AUTO_JUSTIFY_THRESHOLD && !payload.differenceType) {
          return {
            success: false,
            action,
            message: `Diferencia de ${absDiff.toFixed(2)}€ detectada. Indica el tipo de diferencia (differenceType) para continuar.`,
          };
        }

        // REQUEST_CLARIFICATION → don't close, send email
        if (payload.differenceType === "REQUEST_CLARIFICATION") {
          const reco = await tx.reconciliation.create({
            data: {
              companyId,
              type: "MANUAL",
              confidenceScore: 1.0,
              matchReason: "manual_match:pending_clarification",
              status: "PENDING_CLARIFICATION",
              invoiceAmount: invoice.totalAmount,
              bankAmount: txAbs,
              difference: diff,
              differenceType: "REQUEST_CLARIFICATION",
              differenceAmount: diff,
              bankTransactionId: bankTx.id,
              invoiceId: invoice.id,
            },
          });

          await tx.bankTransaction.update({
            where: { id: bankTx.id },
            data: { status: "INVESTIGATING" },
          });

          return {
            success: true,
            action,
            reconciliationId: reco.id,
            message: `Match creado con diferencia de ${absDiff.toFixed(2)}€. Pendiente de aclaración del contacto.`,
          };
        }

        // Create difference journal entry if difference > threshold
        let differenceJournalEntryId: string | undefined;
        if (absDiff > AUTO_JUSTIFY_THRESHOLD && payload.differenceType) {
          const diffType = payload.differenceType as string;
          const pgcMap: Record<string, string> = {
            EARLY_PAYMENT_DISCOUNT: "706",
            BANK_COMMISSION: "626",
            WITHHOLDING_TAX: "473",
            PARTIAL_WRITE_OFF: "650",
            FX_DIFFERENCE: diff > 0 ? "768" : "668",
            OVERPAYMENT_ADVANCE: "438",
            NEGOTIATED_ADJUSTMENT: "706",
          };
          const diffAccount = pgcMap[diffType] ?? "659";

          const diffEntry = await tx.journalEntry.create({
            data: {
              companyId,
              number: 0, // will be assigned
              date: bankTx.valueDate,
              description: `Diferencia match: ${invoice.number} — ${diffType}`,
              type: "ADJUSTMENT",
              status: "DRAFT",
              lines: {
                create: [
                  {
                    debit: absDiff,
                    credit: 0,
                    accountId: diffAccount,
                    description: `Diferencia ${diffType}`,
                  },
                  { debit: 0, credit: absDiff, accountId: "430", description: invoice.number },
                ],
              },
            },
          });
          differenceJournalEntryId = diffEntry.id;
        } else if (absDiff > 0.01 && absDiff <= AUTO_JUSTIFY_THRESHOLD) {
          // Auto-justify small differences as 669 (otros gastos financieros)
          await tx.journalEntry.create({
            data: {
              companyId,
              number: 0,
              date: bankTx.valueDate,
              description: `Diferencia menor: ${invoice.number}`,
              type: "ADJUSTMENT",
              status: "POSTED",
              lines: {
                create: [
                  { debit: absDiff, credit: 0, accountId: "669", description: "Diferencia menor" },
                  { debit: 0, credit: absDiff, accountId: "430", description: invoice.number },
                ],
              },
            },
          });
        }

        const reco = await tx.reconciliation.create({
          data: {
            companyId,
            type: "MANUAL",
            confidenceScore: 1.0,
            matchReason: `manual_match`,
            status: "APPROVED",
            invoiceAmount: invoice.totalAmount,
            bankAmount: txAbs,
            difference: absDiff > 0.01 ? diff : 0,
            differenceReason: payload.differenceReason ?? null,
            differenceAccountId: payload.differenceAccountId ?? null,
            differenceType: (payload.differenceType as any) ?? null,
            differenceAmount: absDiff > 0.01 ? diff : null,
            differenceJournalEntryId: differenceJournalEntryId ?? null,
            bankTransactionId: bankTx.id,
            invoiceId: invoice.id,
            resolvedAt: new Date(),
            resolvedById: userId,
          },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: "RECONCILED", detectedType: "MATCH_SIMPLE" },
        });

        await updateInvoicePaymentStatus(invoice.id, txAbs, tx);

        await createAuditLog(tx, userId, "reconciliation.manual_match", "Reconciliation", reco.id, {
          bankTransactionId: bankTx.id,
          invoiceId: invoice.id,
          differenceType: payload.differenceType,
          differenceAmount: diff,
        });

        return {
          success: true,
          action,
          reconciliationId: reco.id,
          message:
            absDiff > AUTO_JUSTIFY_THRESHOLD
              ? `Match creado con diferencia de ${absDiff.toFixed(2)}€ (${payload.differenceType}). Asiento en borrador.`
              : "Manual match created.",
        };
      }

      // ─── CLASSIFY ───
      case "classify": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });

        const account = await tx.account.findFirstOrThrow({
          where: { code: payload.accountCode!, companyId },
        });

        const classification = await tx.bankTransactionClassification.create({
          data: {
            accountId: account.id,
            cashflowType: payload.cashflowType ?? account.cashflowType ?? "OPERATING",
            description: payload.description ?? null,
          },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: {
            status: "CLASSIFIED",
            classificationId: classification.id,
            detectedType: "EXPENSE_NO_INVOICE",
          },
        });

        // Create rule if requested
        if (payload.createRule) {
          await tx.matchingRule.create({
            data: {
              companyId,
              type: bankTx.counterpartIban ? "IBAN_CLASSIFY" : "CONCEPT_CLASSIFY",
              isActive: true,
              pattern: payload.rulePattern ?? bankTx.conceptParsed ?? bankTx.concept ?? undefined,
              counterpartIban: bankTx.counterpartIban ?? undefined,
              accountCode: payload.accountCode,
              cashflowType: payload.cashflowType ?? "OPERATING",
              action: "classify",
              createdById: userId,
            },
          });
        }

        await createAuditLog(tx, userId, "reconciliation.classify", "BankTransaction", bankTx.id, {
          accountCode: payload.accountCode,
          cashflowType: payload.cashflowType,
        });

        return {
          success: true,
          action,
          bankTransactionId: bankTx.id,
          message: `Classified as ${account.code}.`,
        };
      }

      // ─── MARK INTERNAL ───
      case "mark_internal": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: "INTERNAL", detectedType: "INTERNAL_TRANSFER", priority: "ROUTINE" },
        });

        await createAuditLog(
          tx,
          userId,
          "reconciliation.mark_internal",
          "BankTransaction",
          bankTx.id,
          {}
        );

        return {
          success: true,
          action,
          bankTransactionId: bankTx.id,
          message: "Marked as internal.",
        };
      }

      // ─── MARK INTERCOMPANY ───
      case "mark_intercompany": {
        const link = await tx.intercompanyLink.findUniqueOrThrow({
          where: { id: payload.intercompanyLinkId! },
        });

        const newStatus = payload.intercompanyAction === "eliminate" ? "ELIMINATED" : "CONFIRMED";

        await tx.intercompanyLink.update({
          where: { id: link.id },
          data: { status: newStatus, matchedAt: new Date() },
        });

        // Mark the transaction on this side
        if (link.transactionAId) {
          await tx.bankTransaction.update({
            where: { id: link.transactionAId },
            data: {
              status: newStatus === "CONFIRMED" ? "RECONCILED" : "PENDING",
              detectedType: "INTERCOMPANY",
            },
          });
        }

        // Try to find and link the counterpart transaction
        if (newStatus === "CONFIRMED" && !link.transactionBId) {
          const counterpart = await tx.bankTransaction.findFirst({
            where: {
              companyId: link.companyBId,
              amount: -link.amount * (link.transactionAId ? 1 : -1),
              status: "PENDING",
              valueDate: {
                gte: new Date(link.date.getTime() - 3 * 24 * 60 * 60 * 1000),
                lte: new Date(link.date.getTime() + 3 * 24 * 60 * 60 * 1000),
              },
            },
            orderBy: { valueDate: "asc" },
          });
          if (counterpart) {
            await tx.intercompanyLink.update({
              where: { id: link.id },
              data: { transactionBId: counterpart.id },
            });
            await tx.bankTransaction.update({
              where: { id: counterpart.id },
              data: { status: "RECONCILED", detectedType: "INTERCOMPANY" },
            });
          }
        }

        await createAuditLog(
          tx,
          userId,
          `reconciliation.mark_intercompany.${newStatus.toLowerCase()}`,
          "IntercompanyLink",
          link.id,
          {
            companyAId: link.companyAId,
            companyBId: link.companyBId,
            amount: link.amount,
          }
        );

        return {
          success: true,
          action,
          message:
            newStatus === "CONFIRMED"
              ? "Intercompany transfer confirmed."
              : "Intercompany link eliminated — transaction returned to pending.",
        };
      }

      // ─── MARK DUPLICATE ───
      case "mark_duplicate": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: "DUPLICATE", detectedType: "POSSIBLE_DUPLICATE" },
        });

        if (bankTx.duplicateGroupId) {
          await tx.duplicateGroup.update({
            where: { id: bankTx.duplicateGroupId },
            data: {
              status: "DUPLICATE",
              resolvedAt: new Date(),
              resolution: `Confirmed by ${userId}`,
            },
          });
        }

        await createAuditLog(
          tx,
          userId,
          "reconciliation.mark_duplicate",
          "BankTransaction",
          bankTx.id,
          {
            duplicateOfId: payload.duplicateOfId,
          }
        );

        return {
          success: true,
          action,
          bankTransactionId: bankTx.id,
          message: "Marked as duplicate.",
        };
      }

      // ─── MARK LEGITIMATE ───
      case "mark_legitimate": {
        const group = await tx.duplicateGroup.findUniqueOrThrow({
          where: { id: payload.duplicateGroupId! },
          include: { transactions: { select: { id: true, companyId: true } } },
        });

        if (!group.transactions.every((t) => t.companyId === companyId)) {
          throw new Error("Duplicate group does not belong to this company.");
        }

        await tx.duplicateGroup.update({
          where: { id: group.id },
          data: {
            status: "LEGITIMATE",
            resolvedAt: new Date(),
            resolution: `Legitimate by ${userId}`,
          },
        });

        await tx.bankTransaction.updateMany({
          where: { duplicateGroupId: group.id, companyId },
          data: { status: "PENDING", detectedType: null },
        });

        await createAuditLog(
          tx,
          userId,
          "reconciliation.mark_legitimate",
          "DuplicateGroup",
          group.id,
          {}
        );

        return { success: true, action, message: "Duplicate group marked as legitimate." };
      }

      // ─── MARK RETURN ───
      case "mark_return": {
        const reco = await tx.reconciliation.findFirstOrThrow({
          where: { id: payload.reconciliationId!, companyId },
          include: { bankTransaction: true },
        });

        await tx.reconciliation.update({
          where: { id: reco.id },
          data: { status: "APPROVED", resolvedAt: new Date(), resolvedById: userId },
        });

        if (reco.bankTransactionId) {
          await tx.bankTransaction.update({
            where: { id: reco.bankTransactionId },
            data: { status: "RECONCILED" },
          });
        }

        await createAuditLog(
          tx,
          userId,
          "reconciliation.mark_return",
          "Reconciliation",
          reco.id,
          {}
        );

        return { success: true, action, reconciliationId: reco.id, message: "Marked as return." };
      }

      // ─── IGNORE ───
      case "ignore": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: {
            status: "IGNORED",
            note: payload.reason,
            noteAuthorId: userId,
            noteCreatedAt: new Date(),
          },
        });

        await createAuditLog(tx, userId, "reconciliation.ignore", "BankTransaction", bankTx.id, {
          reason: payload.reason,
        });

        return {
          success: true,
          action,
          bankTransactionId: bankTx.id,
          message: "Transaction ignored.",
        };
      }

      // ─── SPLIT FINANCIAL ───
      case "split_financial": {
        const reco = await tx.reconciliation.findFirstOrThrow({
          where: { id: payload.reconciliationId!, companyId },
          include: { bankTransaction: true },
        });

        await tx.reconciliation.update({
          where: { id: reco.id },
          data: {
            status: "APPROVED",
            resolvedAt: new Date(),
            resolvedById: userId,
            resolution: `split: principal=${payload.principalAmount}, interest=${payload.interestAmount}`,
          },
        });

        if (reco.bankTransactionId) {
          await tx.bankTransaction.update({
            where: { id: reco.bankTransactionId },
            data: { status: "CLASSIFIED" },
          });
        }

        await createAuditLog(
          tx,
          userId,
          "reconciliation.split_financial",
          "Reconciliation",
          reco.id,
          {
            principalAmount: payload.principalAmount,
            interestAmount: payload.interestAmount,
          }
        );

        return {
          success: true,
          action,
          reconciliationId: reco.id,
          message: "Financial split applied.",
        };
      }

      // ─── REGISTER FIXED ASSET (Scenario 19 - CAPEX) ───
      case "register_fixed_asset": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });
        const assetData = payload.assetData as
          | {
              name: string;
              acquisitionCost: number;
              usefulLifeMonths: number;
              residualValue?: number;
              assetAccountCode: string;
              depreciationAccountCode?: string;
              accumDepAccountCode?: string;
            }
          | undefined;
        if (!assetData) throw new Error("assetData required for register_fixed_asset");

        const assetAcct = await tx.account.findFirst({
          where: { code: assetData.assetAccountCode, companyId },
        });
        const depAcct = await tx.account.findFirst({
          where: { code: assetData.depreciationAccountCode ?? "681", companyId },
        });
        const accumAcct = await tx.account.findFirst({
          where: { code: assetData.accumDepAccountCode ?? "281", companyId },
        });
        if (!assetAcct) throw new Error(`Account ${assetData.assetAccountCode} not found`);

        const monthlyDep =
          Math.round(
            ((assetData.acquisitionCost - (assetData.residualValue ?? 0)) /
              assetData.usefulLifeMonths) *
              100
          ) / 100;

        const asset = await tx.fixedAsset.create({
          data: {
            name: assetData.name,
            acquisitionDate: bankTx.valueDate,
            acquisitionCost: assetData.acquisitionCost,
            residualValue: assetData.residualValue ?? 0,
            usefulLifeMonths: assetData.usefulLifeMonths,
            monthlyDepreciation: monthlyDep,
            netBookValue: assetData.acquisitionCost,
            assetAccountId: assetAcct.id,
            depreciationAccountId: depAcct?.id ?? assetAcct.id,
            accumDepAccountId: accumAcct?.id ?? assetAcct.id,
            companyId,
          },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: "RECONCILED", economicCategory: "CAPEX_ACQUISITION" },
        });
        const capexReco = payload.reconciliationId
          ? await tx.reconciliation.findUnique({ where: { id: payload.reconciliationId } })
          : null;
        if (capexReco)
          await tx.reconciliation.update({
            where: { id: capexReco.id },
            data: {
              status: "APPROVED",
              resolvedAt: new Date(),
              resolvedById: userId,
              resolution: "register_fixed_asset",
            },
          });

        return {
          success: true,
          action: "register_fixed_asset",
          reconciliationId: capexReco?.id ?? null,
          message: `Fixed asset "${asset.name}" registered.`,
        };
      }

      // ─── REGISTER INVESTMENT (Scenario 20 - Financial) ───
      case "register_investment": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });
        const invData = payload.investmentData as
          | {
              name: string;
              type: string;
              pgcAccount: string;
              acquisitionCost: number;
              isinCif?: string;
              ownershipPct?: number;
            }
          | undefined;
        if (!invData) throw new Error("investmentData required for register_investment");

        const investment = await tx.investment.create({
          data: {
            name: invData.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: invData.type as any,
            pgcAccount: invData.pgcAccount,
            acquisitionDate: bankTx.valueDate,
            acquisitionCost: invData.acquisitionCost,
            currentValue: invData.acquisitionCost,
            lastValuationDate: bankTx.valueDate,
            isinCif: invData.isinCif,
            ownershipPct: invData.ownershipPct,
            companyId,
          },
        });

        await tx.investmentTransaction.create({
          data: {
            type: "ACQUISITION",
            date: bankTx.valueDate,
            amount: invData.acquisitionCost,
            pgcDebitAccount: invData.pgcAccount,
            pgcCreditAccount: "572",
            investmentId: investment.id,
            bankTransactionId: bankTx.id,
          },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: "RECONCILED", economicCategory: "INVESTMENT_ACQUISITION" },
        });
        const invReco = payload.reconciliationId
          ? await tx.reconciliation.findUnique({ where: { id: payload.reconciliationId } })
          : null;
        if (invReco)
          await tx.reconciliation.update({
            where: { id: invReco.id },
            data: {
              status: "APPROVED",
              resolvedAt: new Date(),
              resolvedById: userId,
              resolution: "register_investment",
            },
          });

        return {
          success: true,
          action: "register_investment",
          reconciliationId: invReco?.id ?? null,
          message: `Investment "${investment.name}" registered.`,
        };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  });

  // Post-transaction: track decision for feedback loop
  // Non-critical — must not break the resolve, but errors should be logged
  try {
    await trackControllerDecision(db ?? (prisma as any), {
      reconciliationId: result.reconciliationId ?? payload.reconciliationId ?? "",
      bankTransactionId: result.bankTransactionId ?? payload.bankTransactionId ?? "",
      invoiceId: payload.invoiceId,
      userId,
      companyId,
      controllerAction: action,
      correctedField:
        action === "reject" ? "action" : action === "classify" ? "accountCode" : undefined,
      correctedTo:
        action === "reject"
          ? `rejected:${payload.reason}`
          : action === "classify"
            ? payload.accountCode
            : undefined,
      createdExplicitRule: payload.createRule,
    });
  } catch (err) {
    console.warn("[learning] Failed to track decision:", err instanceof Error ? err.message : err);
  }

  // Post-transaction: calibrate confidence from feedback
  try {
    const patternKey = txForCalibration?.counterpartIban
      ? `iban:${txForCalibration.counterpartIban}`
      : txForCalibration?.concept
        ? `concept:${txForCalibration.concept.slice(0, 50)}`
        : "";

    if (patternKey) {
      const wasModified =
        action === "reject" ||
        action === "manual_match" ||
        action === "classify" ||
        action === "mark_internal" ||
        action === "mark_intercompany";

      await calibrateFromDecision({
        wasAutoExecuted: false, // resolver is always called by controller action
        wasModified,
        category: inferCategory(txForCalibration?.matchReason, action),
        patternKey,
        companyId,
      });
    }
  } catch (err) {
    console.warn("[learning] Calibration failed:", err instanceof Error ? err.message : err);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result as ResolveResult;
}

function inferCategory(matchReason: string | null | undefined, action: string): ActionCategory {
  const r = matchReason ?? action;
  if (r.includes("exact")) return "exact_match";
  if (r.includes("fuzzy")) return "fuzzy_match";
  if (r.includes("grouped")) return "grouped_match";
  if (r.includes("rule")) return "rule_application";
  if (r.includes("llm_match")) return "llm_match";
  if (r.includes("internal")) return "internal_transfer";
  if (r.includes("intercompany")) return "intercompany_exact";
  if (r.includes("classify")) return "llm_classification";
  return "llm_classification";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function createAuditLog(
  tx: TxClient,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      details: details as import("@prisma/client").Prisma.InputJsonValue,
    },
  });
}
