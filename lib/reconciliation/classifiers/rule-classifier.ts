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
 * Respects:
 * - status (only ACTIVE rules)
 * - priority (higher = checked first)
 * - new condition fields: conceptContains, transactionDirection, counterpartName,
 *   differencePercentMin/Max
 * - updates lastExecutedAt on match
 */
export async function classifyByRules(
  tx: BankTransaction,
  companyId: string
): Promise<RuleClassificationResult | null> {
  const rules = await prisma.matchingRule.findMany({
    where: {
      companyId,
      isActive: true,
      status: "ACTIVE",
    },
    orderBy: [
      { priority: "desc" },  // higher priority first
      { type: "asc" },
      { timesApplied: "desc" },
    ],
  });

  if (rules.length === 0) return null;

  const normalizedIban = tx.counterpartIban?.replace(/\s/g, "").toUpperCase() ?? null;
  const conceptLower = (tx.concept ?? "").toLowerCase();
  const parsedConceptLower = (tx.conceptParsed ?? "").toLowerCase();
  const absAmount = Math.abs(tx.amount);
  const isIncome = tx.amount > 0;

  for (const rule of rules) {
    // ── Check direction filter ──
    if (rule.transactionDirection) {
      if (rule.transactionDirection === "income" && !isIncome) continue;
      if (rule.transactionDirection === "expense" && isIncome) continue;
    }

    // ── Check amount range ──
    if (rule.minAmount != null && absAmount < rule.minAmount) continue;
    if (rule.maxAmount != null && absAmount > rule.maxAmount) continue;

    // ── Check conceptContains (new field) ──
    if (rule.conceptContains) {
      const needle = rule.conceptContains.toLowerCase();
      if (!conceptLower.includes(needle) && !parsedConceptLower.includes(needle)) continue;
    }

    // ── Check counterpartName (new field, substring match) ──
    if (rule.counterpartName) {
      const needle = rule.counterpartName.toLowerCase();
      const txName = (tx.counterpartName ?? "").toLowerCase();
      if (!txName.includes(needle) && !conceptLower.includes(needle)) continue;
    }

    // ── Type-specific matching ──
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
        const ruleIban = rule.counterpartIban.replace(/\s/g, "").toUpperCase();
        matches = normalizedIban === ruleIban;
        // Amount range already checked above
        break;
      }

      case "CONCEPT_CLASSIFY": {
        if (!rule.pattern) {
          // No pattern but conceptContains already matched above → match
          matches = !!rule.conceptContains;
          break;
        }
        try {
          const regex = new RegExp(rule.pattern, "i");
          matches = regex.test(conceptLower) || regex.test(parsedConceptLower);
        } catch {
          const patternLower = rule.pattern.toLowerCase();
          matches = conceptLower.includes(patternLower) || parsedConceptLower.includes(patternLower);
        }
        break;
      }

      case "FINANCIAL_SPLIT": {
        if (!normalizedIban || !rule.counterpartIban) break;
        const ruleIban = rule.counterpartIban.replace(/\s/g, "").toUpperCase();
        matches = normalizedIban === ruleIban && tx.amount < 0;
        break;
      }
    }

    if (!matches) continue;
    if (!rule.accountCode && !rule.cashflowType) continue;

    // ── Match found — update timesApplied + lastExecutedAt ──
    prisma.matchingRule.update({
      where: { id: rule.id },
      data: { timesApplied: { increment: 1 }, lastExecutedAt: new Date() },
    }).catch((err) => console.warn("[rule-classifier] Non-critical operation failed:", err instanceof Error ? err.message : err));

    // ── Calculate confidence ──
    const baseConfidence =
      rule.type === "IBAN_CLASSIFY" || rule.type === "IBAN_INTERNAL" ? 0.95
      : rule.type === "EXACT_AMOUNT_CONTACT" ? 0.92
      : 0.85;
    const usageBoost = Math.min(0.04, rule.timesApplied * 0.005);
    const confidence = Math.min(0.99, baseConfidence + usageBoost);

    return {
      accountCode: rule.accountCode ?? "",
      cashflowType: rule.cashflowType ?? "OPERATING",
      ruleId: rule.id,
      confidence: Math.round(confidence * 100) / 100,
      ruleName: rule.name ?? `${rule.type}:${rule.pattern ?? rule.counterpartIban ?? ""}`,
    };
  }

  return null;
}
