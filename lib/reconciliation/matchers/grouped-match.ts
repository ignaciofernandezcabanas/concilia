import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction, Invoice, Contact } from "@prisma/client";

export interface GroupedMatchResult {
  invoices: (Invoice & { contact: Contact | null })[];
  totalAmount: number;
  confidence: number;
  matchReason: string;
}

// Floating-point comparison tolerance (half a cent)
const EPSILON = 0.005;

/**
 * Finds a combination of pending invoices from the same contact whose
 * amounts sum to the bank transaction amount.
 *
 * Algorithm:
 * 1. Identify the contact by IBAN or CIF
 * 2. Retrieve all pending invoices for that contact
 * 3. Sort by issue date ascending
 * 4. Accumulate invoices until the running total matches the transaction amount
 *
 * Confidence ranges from 0.85 to 0.95 depending on the number of invoices
 * in the group (fewer invoices = higher confidence).
 */
export async function findGroupedMatch(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<GroupedMatchResult | null> {
  const absAmount = Math.abs(tx.amount);
  const isIncome = tx.amount > 0;

  const invoiceTypes = isIncome
    ? (["ISSUED", "CREDIT_RECEIVED"] as const)
    : (["RECEIVED", "CREDIT_ISSUED"] as const);

  // Identify contact by counterpart IBAN
  if (!tx.counterpartIban) {
    return null;
  }

  const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();

  const contact = await db.contact.findFirst({
    where: {
      iban: normalizedIban,
    },
  });

  if (!contact) {
    return null;
  }

  // Get all pending invoices for this contact, sorted by issue date
  const pendingInvoices = await db.invoice.findMany({
    where: {
      contactId: contact.id,
      type: { in: [...invoiceTypes] },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    include: {
      contact: true,
    },
    orderBy: { issueDate: "asc" },
  });

  if (pendingInvoices.length < 2) {
    // Need at least 2 invoices for a grouped match
    return null;
  }

  // Strategy 1: Greedy accumulation by date order
  const greedyResult = findGreedyCombination(pendingInvoices, absAmount);

  // Strategy 2: Try all combinations up to a reasonable limit
  const comboResult =
    pendingInvoices.length <= 15 ? findSubsetSum(pendingInvoices, absAmount) : null;

  // Pick the best result (fewest invoices preferred)
  const result = pickBest(greedyResult, comboResult);

  if (!result) {
    return null;
  }

  // Confidence: 0.95 for 2 invoices, decreasing by 0.02 per additional invoice
  const confidence = Math.max(0.85, 0.95 - (result.length - 2) * 0.02);

  const totalAmount = result.reduce((sum, inv) => sum + inv.totalAmount, 0);

  return {
    invoices: result,
    totalAmount: Math.round(totalAmount * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    matchReason: `grouped_${result.length}_invoices`,
  };
}

/**
 * Greedy accumulation: add invoices by date until the target is reached.
 */
function findGreedyCombination<T extends { totalAmount: number }>(
  invoices: T[],
  target: number
): T[] | null {
  let sum = 0;
  const selected: T[] = [];

  for (const inv of invoices) {
    sum += inv.totalAmount;
    selected.push(inv);

    if (Math.abs(sum - target) < EPSILON) {
      return selected;
    }

    if (sum > target + EPSILON) {
      // Overshot; this greedy path does not work
      return null;
    }
  }

  return null;
}

/**
 * Subset-sum search for small invoice sets.
 * Finds the smallest subset that sums to the target amount.
 */
function findSubsetSum<T extends { totalAmount: number }>(
  invoices: T[],
  target: number
): T[] | null {
  const n = invoices.length;
  let bestSubset: T[] | null = null;

  // Iterate through all combinations using bitmask (up to 15 items = 32768 combos)
  const limit = 1 << n;

  for (let mask = 1; mask < limit; mask++) {
    // Skip single-invoice matches (those are exact matches, not grouped)
    if ((mask & (mask - 1)) === 0) continue;

    let sum = 0;
    const subset: T[] = [];

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += invoices[i].totalAmount;
        subset.push(invoices[i]);

        // Early termination if sum exceeds target
        if (sum > target + EPSILON) break;
      }
    }

    if (Math.abs(sum - target) < EPSILON) {
      if (!bestSubset || subset.length < bestSubset.length) {
        bestSubset = subset;
      }
    }
  }

  return bestSubset;
}

/**
 * Picks the best combination result: fewest invoices wins.
 */
function pickBest<T>(a: T[] | null, b: T[] | null): T[] | null {
  if (!a) return b;
  if (!b) return a;
  return a.length <= b.length ? a : b;
}
