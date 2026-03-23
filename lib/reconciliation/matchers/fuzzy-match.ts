import Fuse from "fuse.js";
import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction, Invoice, Contact, DifferenceReason } from "@prisma/client";

export interface FuzzyMatchResult {
  invoice: Invoice & { contact: Contact | null };
  confidence: number;
  matchReason: string;
  amountDifference: number;
  differencePercent: number;
  suggestedDifferenceReason: DifferenceReason | null;
}

const AMOUNT_TOLERANCE = 0.05; // 5%

/**
 * Finds invoices that approximately match a bank transaction using
 * fuzzy concept matching and an amount tolerance of 5%.
 *
 * Uses fuse.js to match the transaction concept against invoice descriptions
 * and contact names, then filters by amount proximity.
 *
 * Confidence ranges from 0.70 to 0.85 based on the quality of both
 * the concept match and the amount proximity.
 */
export async function findFuzzyMatch(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<FuzzyMatchResult[]> {
  const absAmount = Math.abs(tx.amount);
  const isIncome = tx.amount > 0;

  const invoiceTypes = isIncome
    ? (["ISSUED", "CREDIT_RECEIVED"] as const)
    : (["RECEIVED", "CREDIT_ISSUED"] as const);

  // Amount tolerance bounds
  const amountMin = absAmount * (1 - AMOUNT_TOLERANCE);
  const amountMax = absAmount * (1 + AMOUNT_TOLERANCE);

  // Find invoices within the amount tolerance
  const candidates = await db.invoice.findMany({
    where: {
      type: { in: [...invoiceTypes] },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      totalAmount: {
        gte: amountMin,
        lte: amountMax,
      },
    },
    include: {
      contact: true,
    },
  });

  if (candidates.length === 0) {
    return [];
  }

  // Prepare the search corpus for concept matching
  const searchText = [tx.concept, tx.conceptParsed, tx.counterpartName]
    .filter(Boolean)
    .join(" ");

  if (!searchText.trim()) {
    // No text to match against; fall back to amount-only scoring
    return scoreByAmountOnly(candidates, absAmount, tx);
  }

  // Build fuse.js index over candidate invoices
  const fuseItems = candidates.map((inv) => ({
    invoice: inv,
    searchableText: [
      inv.description,
      inv.number,
      inv.contact?.name,
      inv.contact?.cif,
    ]
      .filter(Boolean)
      .join(" "),
  }));

  const fuse = new Fuse(fuseItems, {
    keys: ["searchableText"],
    threshold: 0.5,
    includeScore: true,
    shouldSort: true,
  });

  const fuseResults = fuse.search(searchText);

  if (fuseResults.length === 0) {
    // No concept matches; fall back to amount-only scoring
    return scoreByAmountOnly(candidates, absAmount, tx);
  }

  return fuseResults.map((result) => {
    const invoice = result.item.invoice;
    const fuseScore = result.score ?? 0.5; // Lower fuse score = better match

    const amountDifference = Math.round((invoice.totalAmount - absAmount) * 100) / 100;
    const differencePercent =
      Math.round((Math.abs(amountDifference) / invoice.totalAmount) * 10000) / 100;

    // Confidence: start at 0.85, reduce by fuse score and amount difference
    const conceptConfidence = 1 - fuseScore; // 0..1, higher is better
    const amountConfidence = 1 - differencePercent / 100; // 0.95..1 range
    const rawConfidence = 0.70 + 0.15 * conceptConfidence * amountConfidence;
    const confidence = Math.min(0.85, Math.max(0.70, Math.round(rawConfidence * 100) / 100));

    const suggestedDifferenceReason = suggestDifferenceReason(
      amountDifference,
      invoice.totalAmount,
      tx
    );

    return {
      invoice,
      confidence,
      matchReason: `fuzzy_concept+amount_tolerance_${differencePercent.toFixed(1)}%`,
      amountDifference,
      differencePercent,
      suggestedDifferenceReason,
    };
  });
}

/**
 * Score candidates purely by amount proximity when no concept text is available.
 */
function scoreByAmountOnly(
  candidates: (Invoice & { contact: Contact | null })[],
  absAmount: number,
  tx: BankTransaction
): FuzzyMatchResult[] {
  return candidates
    .map((invoice) => {
      const amountDifference = Math.round((invoice.totalAmount - absAmount) * 100) / 100;
      const differencePercent =
        Math.round((Math.abs(amountDifference) / invoice.totalAmount) * 10000) / 100;

      const amountConfidence = 1 - differencePercent / 100;
      const confidence = Math.min(
        0.75,
        Math.max(0.70, Math.round((0.70 + 0.05 * amountConfidence) * 100) / 100)
      );

      return {
        invoice,
        confidence,
        matchReason: `fuzzy_amount_only_${differencePercent.toFixed(1)}%`,
        amountDifference,
        differencePercent,
        suggestedDifferenceReason: suggestDifferenceReason(
          amountDifference,
          invoice.totalAmount,
          tx
        ),
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Suggests the most likely reason for a difference between invoice and bank amounts.
 */
function suggestDifferenceReason(
  difference: number,
  invoiceTotal: number,
  tx: BankTransaction
): DifferenceReason | null {
  if (Math.abs(difference) < 0.005) return null;

  const diffPercent = Math.abs(difference) / invoiceTotal;

  // Bank amount is less than invoice: likely a discount or commission
  if (difference > 0) {
    // Invoice > bank amount: the bank received less
    if (diffPercent <= 0.02) return "BANK_COMMISSION";
    if (diffPercent <= 0.05) return "EARLY_PAYMENT";
    return "COMMERCIAL_DISCOUNT";
  }

  // Bank amount is more than invoice: partial context or other
  return "OTHER";
}
