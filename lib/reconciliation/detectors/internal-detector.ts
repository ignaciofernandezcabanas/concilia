import { prisma } from "@/lib/db";
import type { BankTransaction } from "@prisma/client";

export interface InternalTransferResult {
  isInternal: boolean;
  ownAccountId: string | null;
}

/**
 * Detects whether a bank transaction is an internal transfer between
 * the company's own bank accounts.
 *
 * Checks the counterpart IBAN against the OwnBankAccount table.
 */
export async function detectInternalTransfer(
  tx: BankTransaction,
  companyId: string
): Promise<InternalTransferResult> {
  if (!tx.counterpartIban) {
    return { isInternal: false, ownAccountId: null };
  }

  const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();

  const ownAccount = await prisma.ownBankAccount.findFirst({
    where: {
      companyId,
      isActive: true,
      iban: normalizedIban,
    },
  });

  if (!ownAccount) {
    return { isInternal: false, ownAccountId: null };
  }

  return {
    isInternal: true,
    ownAccountId: ownAccount.id,
  };
}
