/**
 * Classification Cascade.
 *
 * Tries the cheapest method first, escalates to more expensive LLMs only if needed.
 *
 * Level 1 — Deterministic (rules)
 * Level 2 — Haiku (quick classify, no CoT)
 * Level 3 — Sonnet (full CoT classify)
 * Level 4 — Unresolved (bandeja)
 */

import { classifyByRules } from "@/lib/reconciliation/classifiers/rule-classifier";
import { callAIJson } from "@/lib/ai/model-router";
import { CLASSIFY_QUICK, CLASSIFY_LLM } from "@/lib/ai/prompt-registry";
import {
  calculateConfidence,
  runSystemChecks,
  type ConfidenceResult,
} from "@/lib/ai/confidence-engine";
import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction } from "@prisma/client";

export interface CascadeResult {
  accountCode: string | null;
  cashflowType: string;
  confidence: ConfidenceResult;
  resolvedBy: "deterministic" | "haiku" | "sonnet" | "unresolved";
}

/**
 * Classify a bank transaction using a cost-efficient cascade.
 */
export async function classifyWithCascade(
  tx: BankTransaction,
  db: ScopedPrisma,
  threshold: number
): Promise<CascadeResult> {
  // ── Level 1: Deterministic (rules) ──
  const ruleResult = await classifyByRules(tx, tx.companyId);

  if (ruleResult) {
    const confidence = calculateConfidence({
      category: "rule_application",
      threshold,
      companyId: tx.companyId,
      ruleErrorRate: 0, // TODO: compute from historical data
    });

    if (confidence.score >= 0.80) {
      return {
        accountCode: ruleResult.accountCode,
        cashflowType: ruleResult.cashflowType,
        confidence,
        resolvedBy: "deterministic",
      };
    }
  }

  // ── Build summaries for LLM calls ──
  const txSummary = buildTxSummary(tx);

  // Get historical classifications for context
  const historicalTxs = await db.bankTransaction.findMany({
    where: {
      status: "CLASSIFIED",
      classification: { isNot: null },
    },
    include: {
      classification: {
        include: { account: { select: { code: true, name: true } } },
      },
    },
    orderBy: { valueDate: "desc" },
    take: 10,
  });

  const historySummary =
    historicalTxs.length > 0
      ? historicalTxs
          .map(
            (h) =>
              `- "${h.concept ?? ""}" | ${h.amount.toFixed(2)} EUR | ` +
              `${h.classification?.account.code ?? ""} (${h.classification?.account.name ?? ""})`
          )
          .join("\n")
      : "No hay datos históricos.";

  // ── Level 2: Haiku (quick, no CoT) ──
  const haikuResult = await callAIJson(
    "classify_quick",
    CLASSIFY_QUICK.system,
    CLASSIFY_QUICK.buildUser({ txSummary, historySummary }),
    CLASSIFY_QUICK.schema
  );

  if (haikuResult) {
    const checks = await runSystemChecks(haikuResult.accountCode, tx, db);
    const confidence = calculateConfidence({
      category: "llm_classification",
      threshold,
      companyId: tx.companyId,
      llmConfidence: haikuResult.confidence,
      systemCheckMultiplier: checks.multiplier,
    });

    if (confidence.score >= 0.85) {
      return {
        accountCode: haikuResult.accountCode,
        cashflowType: haikuResult.cashflowType,
        confidence,
        resolvedBy: "haiku",
      };
    }
  }

  // ── Level 3: Sonnet (full CoT) ──
  const sonnetResult = await callAIJson(
    "classify_llm",
    CLASSIFY_LLM.system,
    CLASSIFY_LLM.buildUser({ txSummary, historySummary }),
    CLASSIFY_LLM.schema
  );

  if (sonnetResult) {
    const checks = await runSystemChecks(sonnetResult.accountCode, tx, db);
    const confidence = calculateConfidence({
      category: "llm_classification",
      threshold,
      companyId: tx.companyId,
      llmConfidence: sonnetResult.confidence,
      systemCheckMultiplier: checks.multiplier,
    });

    return {
      accountCode: sonnetResult.accountCode,
      cashflowType: sonnetResult.cashflowType,
      confidence,
      resolvedBy: "sonnet",
    };
  }

  // ── Level 4: Unresolved ──
  return {
    accountCode: null,
    cashflowType: "OPERATING",
    confidence: calculateConfidence({
      category: "llm_classification",
      threshold,
      companyId: tx.companyId,
      llmConfidence: 0,
      systemCheckMultiplier: 0.50,
    }),
    resolvedBy: "unresolved",
  };
}

function buildTxSummary(tx: BankTransaction): string {
  return (
    `Amount: ${tx.amount.toFixed(2)} EUR\n` +
    `Date: ${tx.valueDate.toISOString().slice(0, 10)}\n` +
    `Concept: ${tx.concept ?? "N/A"}\n` +
    `Parsed: ${tx.conceptParsed ?? "N/A"}\n` +
    `Counterpart IBAN: ${tx.counterpartIban ?? "N/A"}\n` +
    `Counterpart Name: ${tx.counterpartName ?? "N/A"}`
  );
}
