import { prisma } from "@/lib/db";
import type {
  BankTransactionStatus,
  InvoiceStatus,
  ReconciliationStatus,
  CashflowType,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolveAction =
  | "approve_match"
  | "reject"
  | "investigate"
  | "classify_manual"
  | "mark_internal"
  | "mark_duplicate"
  | "mark_return"
  | "ignore"
  | "split_financial";

export interface ResolvePayload {
  action: ResolveAction;

  /** Manual classification fields (for classify_manual) */
  accountCode?: string;
  cashflowType?: CashflowType;
  description?: string;

  /** Whether to create a MatchingRule from this resolution */
  createRule?: boolean;
  rulePattern?: string;

  /** Financial split fields (for split_financial) */
  principalAmount?: number;
  interestAmount?: number;
  principalAccountCode?: string;
  interestAccountCode?: string;

  /** Optional note */
  note?: string;
}

export interface ResolveResult {
  success: boolean;
  reconciliationId: string;
  newTxStatus: BankTransactionStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a reconciliation item by applying the specified action.
 *
 * All mutations run inside a Prisma transaction to ensure data consistency.
 * After resolution, an AuditLog entry is created and, optionally, a
 * Notification for relevant users.
 */
export async function resolveItem(
  reconciliationId: string,
  payload: ResolvePayload,
  userId: string,
  companyId: string
): Promise<ResolveResult> {
  const { action } = payload;

  return prisma.$transaction(async (tx) => {
    // Load the reconciliation with related entities
    const reconciliation = await tx.reconciliation.findUniqueOrThrow({
      where: { id: reconciliationId },
      include: {
        bankTransaction: true,
        invoice: true,
      },
    });

    if (reconciliation.companyId !== companyId) {
      throw new Error("Reconciliation does not belong to this company.");
    }

    if (reconciliation.status === "APPROVED" || reconciliation.status === "AUTO_APPROVED") {
      throw new Error("Reconciliation is already resolved.");
    }

    const bankTx = reconciliation.bankTransaction;
    if (!bankTx) {
      throw new Error("Reconciliation has no linked bank transaction.");
    }

    let newTxStatus: BankTransactionStatus;
    let newRecoStatus: ReconciliationStatus;
    let message: string;

    switch (action) {
      // ---------------------------------------------------------------
      // APPROVE MATCH
      // ---------------------------------------------------------------
      case "approve_match": {
        newTxStatus = "RECONCILED";
        newRecoStatus = "APPROVED";
        message = "Match approved.";

        // Update invoice payment status if linked
        if (reconciliation.invoice) {
          const invoice = reconciliation.invoice;
          const paidSoFar = invoice.amountPaid + Math.abs(bankTx.amount);
          const fullyPaid = paidSoFar >= invoice.totalAmount - 0.005;

          const newInvoiceStatus: InvoiceStatus = fullyPaid ? "PAID" : "PARTIAL";

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid: Math.round(paidSoFar * 100) / 100,
              amountPending: fullyPaid
                ? 0
                : Math.round((invoice.totalAmount - paidSoFar) * 100) / 100,
              status: newInvoiceStatus,
            },
          });
        }
        break;
      }

      // ---------------------------------------------------------------
      // REJECT
      // ---------------------------------------------------------------
      case "reject": {
        newTxStatus = "PENDING";
        newRecoStatus = "REJECTED";
        message = "Match rejected. Transaction returned to pending.";
        break;
      }

      // ---------------------------------------------------------------
      // INVESTIGATE
      // ---------------------------------------------------------------
      case "investigate": {
        newTxStatus = "INVESTIGATING";
        newRecoStatus = "REJECTED";
        message = "Transaction flagged for investigation.";
        break;
      }

      // ---------------------------------------------------------------
      // CLASSIFY MANUAL
      // ---------------------------------------------------------------
      case "classify_manual": {
        if (!payload.accountCode) {
          throw new Error("accountCode is required for manual classification.");
        }

        // Resolve the account
        const account = await tx.account.findFirst({
          where: { code: payload.accountCode, companyId },
        });

        if (!account) {
          throw new Error(`Account ${payload.accountCode} not found.`);
        }

        // Create or update the classification
        const classification = await tx.bankTransactionClassification.create({
          data: {
            accountId: account.id,
            cashflowType: payload.cashflowType ?? account.cashflowType ?? "OPERATING",
            description: payload.description ?? null,
          },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { classificationId: classification.id },
        });

        newTxStatus = "CLASSIFIED";
        newRecoStatus = "APPROVED";
        message = `Classified as ${account.code} - ${account.name}.`;
        break;
      }

      // ---------------------------------------------------------------
      // MARK INTERNAL
      // ---------------------------------------------------------------
      case "mark_internal": {
        newTxStatus = "INTERNAL";
        newRecoStatus = "APPROVED";
        message = "Marked as internal transfer.";
        break;
      }

      // ---------------------------------------------------------------
      // MARK DUPLICATE
      // ---------------------------------------------------------------
      case "mark_duplicate": {
        newTxStatus = "DUPLICATE";
        newRecoStatus = "APPROVED";
        message = "Marked as duplicate.";

        // Resolve the duplicate group if it exists
        if (bankTx.duplicateGroupId) {
          await tx.duplicateGroup.update({
            where: { id: bankTx.duplicateGroupId },
            data: {
              status: "DUPLICATE",
              resolvedAt: new Date(),
              resolution: `Confirmed duplicate by user ${userId}`,
            },
          });
        }
        break;
      }

      // ---------------------------------------------------------------
      // MARK RETURN
      // ---------------------------------------------------------------
      case "mark_return": {
        newTxStatus = "RECONCILED";
        newRecoStatus = "APPROVED";
        message = "Marked as return/reversal.";
        break;
      }

      // ---------------------------------------------------------------
      // IGNORE
      // ---------------------------------------------------------------
      case "ignore": {
        newTxStatus = "IGNORED";
        newRecoStatus = "REJECTED";
        message = "Transaction ignored.";
        break;
      }

      // ---------------------------------------------------------------
      // SPLIT FINANCIAL
      // ---------------------------------------------------------------
      case "split_financial": {
        if (!payload.principalAmount || !payload.interestAmount) {
          throw new Error(
            "principalAmount and interestAmount are required for financial splits."
          );
        }

        newTxStatus = "CLASSIFIED";
        newRecoStatus = "APPROVED";
        message = `Financial split: principal ${payload.principalAmount.toFixed(2)}, interest ${payload.interestAmount.toFixed(2)}.`;
        break;
      }

      default: {
        throw new Error(`Unknown action: ${action}`);
      }
    }

    // Update reconciliation status
    await tx.reconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: newRecoStatus,
        resolvedAt: new Date(),
        resolvedById: userId,
        resolution: `${action}${payload.note ? `: ${payload.note}` : ""}`,
      },
    });

    // Update bank transaction status and optional note
    const txUpdateData: Record<string, unknown> = {
      status: newTxStatus,
      updatedAt: new Date(),
    };

    if (payload.note) {
      txUpdateData.note = payload.note;
      txUpdateData.noteAuthorId = userId;
      txUpdateData.noteCreatedAt = new Date();
    }

    await tx.bankTransaction.update({
      where: { id: bankTx.id },
      data: txUpdateData,
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        action: `reconciliation.${action}`,
        entityType: "Reconciliation",
        entityId: reconciliationId,
        userId,
        details: {
          reconciliationId,
          bankTransactionId: bankTx.id,
          invoiceId: reconciliation.invoiceId,
          action,
          previousStatus: reconciliation.status,
          newStatus: newRecoStatus,
          ...(payload.note ? { note: payload.note } : {}),
          ...(payload.accountCode ? { accountCode: payload.accountCode } : {}),
        },
      },
    });

    // Create matching rule if requested
    if (payload.createRule && action === "classify_manual" && payload.accountCode) {
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

    // Create notification for admins on urgent actions
    if (action === "investigate") {
      const admins = await tx.user.findMany({
        where: { companyId, role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });

      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            type: "RECONCILIATION" as const,
            title: "Transaction under investigation",
            body: `Transaction of ${bankTx.amount.toFixed(2)} EUR (${bankTx.concept ?? "no concept"}) has been flagged for investigation.`,
            userId: admin.id,
            companyId,
            actionUrl: `/reconciliation/${reconciliationId}`,
          })),
        });
      }
    }

    return {
      success: true,
      reconciliationId,
      newTxStatus,
      message,
    };
  });
}
