import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction } from "@prisma/client";

export interface FinancialOpResult {
  isFinancial: boolean;
  suggestedPrincipal: number | null;
  suggestedInterest: number | null;
}

const MONTHLY_TOLERANCE_DAYS = 3;
const MIN_PATTERN_OCCURRENCES = 2;

/**
 * Detects whether a bank transaction is a recurring financial operation
 * such as a loan payment, lease payment, or similar.
 *
 * Detection criteria:
 * - Fixed (or near-fixed) amount from the same IBAN
 * - Monthly recurrence pattern
 *
 * When detected, suggests a principal/interest split based on any existing
 * FINANCIAL_SPLIT rules for the same counterpart.
 */
export async function detectFinancialOp(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<FinancialOpResult> {
  // Financial operations are typically outgoing (negative)
  if (tx.amount >= 0 || !tx.counterpartIban) {
    return { isFinancial: false, suggestedPrincipal: null, suggestedInterest: null };
  }

  const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();
  const absAmount = Math.abs(tx.amount);

  // Amount tolerance: 1% to account for minor interest variations
  const amountMin = absAmount * 0.99;
  const amountMax = absAmount * 1.01;

  // Look for historical transactions with similar amount from the same IBAN
  const historicalTx = await db.bankTransaction.findMany({
    where: {
      id: { not: tx.id },
      counterpartIban: normalizedIban,
      amount: {
        gte: -amountMax,
        lte: -amountMin,
      },
      valueDate: {
        // Look back 12 months
        gte: new Date(tx.valueDate.getTime() - 365 * 24 * 60 * 60 * 1000),
        lt: tx.valueDate,
      },
    },
    orderBy: { valueDate: "asc" },
  });

  if (historicalTx.length < MIN_PATTERN_OCCURRENCES) {
    return { isFinancial: false, suggestedPrincipal: null, suggestedInterest: null };
  }

  // Check for monthly recurrence
  const isMonthlyPattern = checkMonthlyPattern(historicalTx.map((t) => t.valueDate));

  if (!isMonthlyPattern) {
    return { isFinancial: false, suggestedPrincipal: null, suggestedInterest: null };
  }

  // Check if there's an existing FINANCIAL_SPLIT rule for this counterpart
  const splitRule = await db.matchingRule.findFirst({
    where: {
      type: "FINANCIAL_SPLIT",
      counterpartIban: normalizedIban,
      isActive: true,
    },
  });

  let suggestedPrincipal: number | null = null;
  let suggestedInterest: number | null = null;

  if (splitRule) {
    // Use the split percentages from the rule
    // action is expected to contain JSON like {"principalPct": 0.85, "interestPct": 0.15}
    try {
      const splitConfig = JSON.parse(splitRule.action);
      const principalPct = splitConfig.principalPct ?? 0.85;
      const interestPct = splitConfig.interestPct ?? 0.15;
      suggestedPrincipal = Math.round(absAmount * principalPct * 100) / 100;
      suggestedInterest = Math.round(absAmount * interestPct * 100) / 100;
    } catch {
      // Fallback: default 85/15 split
      suggestedPrincipal = Math.round(absAmount * 0.85 * 100) / 100;
      suggestedInterest = Math.round(absAmount * 0.15 * 100) / 100;
    }
  } else {
    // Default estimate: 85% principal, 15% interest
    suggestedPrincipal = Math.round(absAmount * 0.85 * 100) / 100;
    suggestedInterest = Math.round(absAmount * 0.15 * 100) / 100;
  }

  return {
    isFinancial: true,
    suggestedPrincipal,
    suggestedInterest,
  };
}

/**
 * Checks whether a set of dates follows a roughly monthly pattern.
 * Allows +/- MONTHLY_TOLERANCE_DAYS from the expected monthly interval.
 */
function checkMonthlyPattern(dates: Date[]): boolean {
  if (dates.length < MIN_PATTERN_OCCURRENCES) return false;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let monthlyCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const diffDays = (sorted[i].getTime() - sorted[i - 1].getTime()) / (24 * 60 * 60 * 1000);

    // A month is roughly 28-31 days; allow some tolerance
    const isMonthlyGap =
      diffDays >= 28 - MONTHLY_TOLERANCE_DAYS && diffDays <= 31 + MONTHLY_TOLERANCE_DAYS;

    if (isMonthlyGap) {
      monthlyCount++;
    }
  }

  // At least half the intervals should be monthly
  return monthlyCount >= Math.floor((sorted.length - 1) / 2);
}
