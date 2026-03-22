/**
 * Unified reconciliation resolver.
 *
 * ALL resolution logic lives here. The API route handler delegates to this
 * module and does NOT contain any business logic or direct Prisma writes.
 *
 * Every mutation runs inside a single Prisma $transaction for data consistency.
 */

import { prisma } from "@/lib/db";
import { updateInvoicePaymentStatus } from "./invoice-payments";
import { trackControllerDecision } from "./decision-tracker";
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
  | "mark_duplicate"
  | "mark_legitimate"
  | "mark_return"
  | "ignore"
  | "split_financial";

export interface ResolvePayload {
  action: ResolveAction;
  reconciliationId?: string;

  // For manual_match
  bankTransactionId?: string;
  invoiceId?: string;
  differenceReason?: DifferenceReason;
  differenceAccountId?: string;

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

  // For split_financial
  principalAmount?: number;
  interestAmount?: number;

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
  companyId: string
): Promise<ResolveResult> {
  const { action } = payload;

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
            await tx.matchingRule.update({ where: { id: ruleId }, data: { isActive: false } }).catch(() => {});
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
          data: { status: "REJECTED" as ReconciliationStatus, resolvedAt: new Date(), resolvedById: userId, resolution: payload.note ?? "Under investigation" },
        });

        if (reco.bankTransactionId) {
          await tx.bankTransaction.update({
            where: { id: reco.bankTransactionId },
            data: { status: "INVESTIGATING" as BankTransactionStatus, note: payload.note, noteAuthorId: userId, noteCreatedAt: new Date() },
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

        await createAuditLog(tx, userId, "reconciliation.investigate", "Reconciliation", reco.id, { note: payload.note });

        return { success: true, action, reconciliationId: reco.id, message: "Flagged for investigation." };
      }

      // ─── MANUAL MATCH ───
      case "manual_match": {
        const [bankTx, invoice] = await Promise.all([
          tx.bankTransaction.findFirstOrThrow({ where: { id: payload.bankTransactionId!, companyId } }),
          tx.invoice.findFirstOrThrow({ where: { id: payload.invoiceId!, companyId } }),
        ]);

        const diff = Math.abs(Math.abs(bankTx.amount) - invoice.totalAmount);

        const reco = await tx.reconciliation.create({
          data: {
            companyId,
            type: "MANUAL",
            confidenceScore: 1.0,
            matchReason: `manual_match`,
            status: "APPROVED",
            invoiceAmount: invoice.totalAmount,
            bankAmount: Math.abs(bankTx.amount),
            difference: diff > 0.01 ? diff : 0,
            differenceReason: payload.differenceReason ?? null,
            differenceAccountId: payload.differenceAccountId ?? null,
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

        await updateInvoicePaymentStatus(invoice.id, Math.abs(bankTx.amount), tx);

        await createAuditLog(tx, userId, "reconciliation.manual_match", "Reconciliation", reco.id, {
          bankTransactionId: bankTx.id,
          invoiceId: invoice.id,
        });

        return { success: true, action, reconciliationId: reco.id, message: "Manual match created." };
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
          data: { status: "CLASSIFIED", classificationId: classification.id, detectedType: "EXPENSE_NO_INVOICE" },
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

        return { success: true, action, bankTransactionId: bankTx.id, message: `Classified as ${account.code}.` };
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

        await createAuditLog(tx, userId, "reconciliation.mark_internal", "BankTransaction", bankTx.id, {});

        return { success: true, action, bankTransactionId: bankTx.id, message: "Marked as internal." };
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
            data: { status: "DUPLICATE", resolvedAt: new Date(), resolution: `Confirmed by ${userId}` },
          });
        }

        await createAuditLog(tx, userId, "reconciliation.mark_duplicate", "BankTransaction", bankTx.id, {
          duplicateOfId: payload.duplicateOfId,
        });

        return { success: true, action, bankTransactionId: bankTx.id, message: "Marked as duplicate." };
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
          data: { status: "LEGITIMATE", resolvedAt: new Date(), resolution: `Legitimate by ${userId}` },
        });

        await tx.bankTransaction.updateMany({
          where: { duplicateGroupId: group.id, companyId },
          data: { status: "PENDING", detectedType: null },
        });

        await createAuditLog(tx, userId, "reconciliation.mark_legitimate", "DuplicateGroup", group.id, {});

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

        await createAuditLog(tx, userId, "reconciliation.mark_return", "Reconciliation", reco.id, {});

        return { success: true, action, reconciliationId: reco.id, message: "Marked as return." };
      }

      // ─── IGNORE ───
      case "ignore": {
        const bankTx = await tx.bankTransaction.findFirstOrThrow({
          where: { id: payload.bankTransactionId!, companyId },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: "IGNORED", note: payload.reason, noteAuthorId: userId, noteCreatedAt: new Date() },
        });

        await createAuditLog(tx, userId, "reconciliation.ignore", "BankTransaction", bankTx.id, {
          reason: payload.reason,
        });

        return { success: true, action, bankTransactionId: bankTx.id, message: "Transaction ignored." };
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

        await createAuditLog(tx, userId, "reconciliation.split_financial", "Reconciliation", reco.id, {
          principalAmount: payload.principalAmount,
          interestAmount: payload.interestAmount,
        });

        return { success: true, action, reconciliationId: reco.id, message: "Financial split applied." };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  });

  // Post-transaction: track decision for feedback loop
  // Non-critical — must not break the resolve, but errors should be logged
  try {
    await trackControllerDecision({
      reconciliationId: result.reconciliationId ?? payload.reconciliationId,
      bankTransactionId: result.bankTransactionId ?? payload.bankTransactionId,
      invoiceId: payload.invoiceId,
      userId,
      companyId,
      controllerAction: action,
      correctedField: action === "reject" ? "action" : action === "classify" ? "accountCode" : undefined,
      correctedTo: action === "reject" ? `rejected:${payload.reason}` : action === "classify" ? payload.accountCode : undefined,
      createdExplicitRule: payload.createRule,
    });
  } catch (err) {
    console.warn("[learning] Failed to track decision:", err instanceof Error ? err.message : err);
  }

  return result;
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
    data: { userId, action, entityType, entityId, details },
  });
}
