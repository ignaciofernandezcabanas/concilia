import { prisma } from "@/lib/db";
import type { BankTransaction, CashflowType } from "@prisma/client";

export interface RuleClassificationResult {
  accountCode: string;
  cashflowType: CashflowType;
  ruleId: string;
  confidence: number;
  ruleName: string;
}

/**
 * Classifies a bank transaction using the company's active matching rules.
 *
 * Checks rules in priority order:
 * 1. IBAN_INTERNAL - counterpart IBAN identifies internal transfers
 * 2. IBAN_CLASSIFY - counterpart IBAN maps to a specific account
 * 3. EXACT_AMOUNT_CONTACT - specific amount + contact combination
 * 4. CONCEPT_CLASSIFY - concept text matches a regex/substring pattern
 * 5. FINANCIAL_SPLIT - recurring financial operations
 *
 * Returns the first matching rule's classification.
 */
export async function classifyByRules(
  tx: BankTransaction,
  companyId: string
): Promise<RuleClassificationResult | null> {
  const rules = await prisma.matchingRule.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: [
      // Process more specific rules first
      { type: "asc" },
      { timesApplied: "desc" },
    ],
  });

  if (rules.length === 0) {
    return null;
  }

  const normalizedIban = tx.counterpartIban
    ?.replace(/\s/g, "")
    .toUpperCase() ?? null;

  const conceptLower = (tx.concept ?? "").toLowerCase();
  const parsedConceptLower = (tx.conceptParsed ?? "").toLowerCase();
  const absAmount = Math.abs(tx.amount);

  for (const rule of rules) {
    let matches = false;

    switch (rule.type) {
      case "IBAN_INTERNAL":
      case "IBAN_CLASSIFY": {
        if (!normalizedIban || !rule.counterpartIban) break;
        const ruleIban = rule.counterpartIban.replace(/\s/g, "").toUpperCase();
        matches = normalizedIban === ruleIban;
        break;
      }

      case "EXACT_AMOUNT_CONTACT": {
        if (!normalizedIban || !rule.counterpartIban) break;
        const ruleIban2 = rule.counterpartIban.replace(/\s/g, "").toUpperCase();
        const ibanMatch = normalizedIban === ruleIban2;

        const amountInRange =
          (rule.minAmount == null || absAmount >= rule.minAmount) &&
          (rule.maxAmount == null || absAmount <= rule.maxAmount);

        matches = ibanMatch && amountInRange;
        break;
      }

      case "CONCEPT_CLASSIFY": {
        if (!rule.pattern) break;
        try {
          const regex = new RegExp(rule.pattern, "i");
          matches =
            regex.test(conceptLower) || regex.test(parsedConceptLower);
        } catch {
          // Invalid regex: fall back to substring match
          const patternLower = rule.pattern.toLowerCase();
          matches =
            conceptLower.includes(patternLower) ||
            parsedConceptLower.includes(patternLower);
        }
        break;
      }

      case "FINANCIAL_SPLIT": {
        // Financial splits are handled by the financial detector;
        // here we just check if the IBAN matches
        if (!normalizedIban || !rule.counterpartIban) break;
        const ruleIban3 = rule.counterpartIban.replace(/\s/g, "").toUpperCase();
        matches = normalizedIban === ruleIban3 && tx.amount < 0;
        break;
      }
    }

    if (!matches) continue;

    // Rule matched; resolve the account code
    if (!rule.accountCode && !rule.cashflowType) continue;

    const accountCode = rule.accountCode ?? "";
    const cashflowType = rule.cashflowType ?? "OPERATING";

    // Increment the timesApplied counter (fire-and-forget)
    prisma.matchingRule
      .update({
        where: { id: rule.id },
        data: { timesApplied: { increment: 1 } },
      })
      .catch(() => {
        // Non-critical
      });

    // Confidence based on rule type and how often it has been applied
    const baseConfidence =
      rule.type === "IBAN_CLASSIFY" || rule.type === "IBAN_INTERNAL"
        ? 0.95
        : rule.type === "EXACT_AMOUNT_CONTACT"
          ? 0.92
          : 0.85;

    // Slight boost for well-tested rules (up to +0.04)
    const usageBoost = Math.min(0.04, rule.timesApplied * 0.005);
    const confidence = Math.min(0.99, baseConfidence + usageBoost);

    return {
      accountCode,
      cashflowType,
      ruleId: rule.id,
      confidence: Math.round(confidence * 100) / 100,
      ruleName: `${rule.type}:${rule.pattern ?? rule.counterpartIban ?? ""}`,
    };
  }

  return null;
}
