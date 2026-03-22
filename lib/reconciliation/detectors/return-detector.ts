import { prisma } from "@/lib/db";
import type { BankTransaction } from "@prisma/client";

export interface ReturnDetectionResult {
  isReturn: boolean;
  originalTxId: string | null;
  originalReconciliationId: string | null;
}

const RETURN_WINDOW_DAYS = 30;

/**
 * Detects whether a bank transaction is a return (reversal) of a
 * previously reconciled transaction.
 *
 * A return is identified when:
 * - The amount is the exact inverse of a previously reconciled transaction
 * - The counterpart is the same (matching IBAN)
 * - The original transaction occurred within the last 30 days
 */
export async function detectReturn(
  tx: BankTransaction,
  companyId: string
): Promise<ReturnDetectionResult> {
  if (!tx.counterpartIban) {
    return { isReturn: false, originalTxId: null, originalReconciliationId: null };
  }

  const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();
  const inverseAmount = -tx.amount;
  const windowDate = new Date(
    tx.valueDate.getTime() - RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  // Look for a reconciled transaction with the inverse amount from the same counterpart
  const originalTx = await prisma.bankTransaction.findFirst({
    where: {
      companyId,
      id: { not: tx.id },
      amount: inverseAmount,
      counterpartIban: normalizedIban,
      status: "RECONCILED",
      valueDate: {
        gte: windowDate,
        lte: tx.valueDate,
      },
    },
    include: {
      reconciliations: {
        where: {
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { valueDate: "desc" },
  });

  if (!originalTx) {
    return { isReturn: false, originalTxId: null, originalReconciliationId: null };
  }

  const reconciliation = originalTx.reconciliations[0] ?? null;

  return {
    isReturn: true,
    originalTxId: originalTx.id,
    originalReconciliationId: reconciliation?.id ?? null,
  };
}
