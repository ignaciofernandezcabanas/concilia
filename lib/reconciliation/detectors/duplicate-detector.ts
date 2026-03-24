import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction } from "@prisma/client";

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  groupId: string | null;
  relatedTx: BankTransaction[];
}

const DUPLICATE_WINDOW_HOURS = 48;

/**
 * Detects potential duplicate bank transactions.
 *
 * A transaction is considered a potential duplicate when another transaction
 * exists with the same amount, a similar or identical counterpart IBAN,
 * and a value date within 48 hours.
 */
export async function detectDuplicates(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<DuplicateDetectionResult> {
  const windowMs = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;
  const dateFrom = new Date(tx.valueDate.getTime() - windowMs);
  const dateTo = new Date(tx.valueDate.getTime() + windowMs);

  const candidates = await db.bankTransaction.findMany({
    where: {
      id: { not: tx.id },
      amount: tx.amount,
      valueDate: {
        gte: dateFrom,
        lte: dateTo,
      },
      // Exclude transactions already marked as legitimate duplicates
      status: { notIn: ["IGNORED"] },
    },
  });

  if (candidates.length === 0) {
    return { isDuplicate: false, groupId: null, relatedTx: [] };
  }

  // Filter further by counterpart IBAN similarity
  const matchingTx = candidates.filter((candidate) => {
    // If both have IBANs, they must match
    if (tx.counterpartIban && candidate.counterpartIban) {
      const normalizedA = tx.counterpartIban.replace(/\s/g, "").toUpperCase();
      const normalizedB = candidate.counterpartIban.replace(/\s/g, "").toUpperCase();
      return normalizedA === normalizedB;
    }

    // If neither has an IBAN, compare concepts for similarity
    if (!tx.counterpartIban && !candidate.counterpartIban) {
      return (
        tx.concept &&
        candidate.concept &&
        tx.concept.toLowerCase() === candidate.concept.toLowerCase()
      );
    }

    return false;
  });

  if (matchingTx.length === 0) {
    return { isDuplicate: false, groupId: null, relatedTx: [] };
  }

  // Check if any of the matching transactions already belong to a group
  const existingGroupTx = matchingTx.find((t) => t.duplicateGroupId);

  let groupId: string;

  if (existingGroupTx?.duplicateGroupId) {
    // Add this transaction to the existing group
    groupId = existingGroupTx.duplicateGroupId;
    await db.bankTransaction.update({
      where: { id: tx.id },
      data: { duplicateGroupId: groupId },
    });
  } else {
    // Create a new duplicate group containing all matching transactions + this one
    const group = await db.duplicateGroup.create({
      data: {
        status: "PENDING",
        transactions: {
          connect: [{ id: tx.id }, ...matchingTx.map((t) => ({ id: t.id }))],
        },
      },
    });
    groupId = group.id;
  }

  return {
    isDuplicate: true,
    groupId,
    relatedTx: matchingTx,
  };
}
