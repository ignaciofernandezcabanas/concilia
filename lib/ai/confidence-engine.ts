/**
 * Confidence Engine — Pure module.
 *
 * Receives data, calculates a confidence score, returns result.
 * No side effects, no DB writes, no actions executed.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction } from "@prisma/client";
import Fuse from "fuse.js";

// ── Types ──

export type ActionCategory =
  | "exact_match"
  | "fuzzy_match"
  | "grouped_match"
  | "difference_match"
  | "recurring_exact"
  | "recurring_variable"
  | "rule_application"
  | "internal_transfer"
  | "intercompany_exact"
  | "intercompany_approx"
  | "llm_classification"
  | "llm_match"
  | "provision"
  | "amortization"
  | "periodification"
  | "manual_journal";

export interface ConfidenceResult {
  score: number;
  autoExecute: boolean;
  reasoning: string;
  factors: {
    base: number;
    historical: number;
    systemChecks: number;
    materiality: number;
    final: number;
  };
  category: ActionCategory;
}

export interface ConfidenceContext {
  category: ActionCategory;
  threshold: number;
  companyId: string;
  tx?: BankTransaction;
  // For LLM outputs
  llmConfidence?: number;
  systemCheckMultiplier?: number;
  // For matches
  contactId?: string;
  invoiceCount?: number;
  // For intercompany
  dateDiffDays?: number;
  amountDiffPercent?: number;
  // For recurring
  consecutiveCount?: number;
  amountZScore?: number;
  // For rules
  ruleErrorRate?: number;
  // For difference
  discountFrequency?: number;
  isAtypical?: boolean;
  // For provisions
  priorProvisionCount?: number;
  // For amortization
  monthsApproved?: number;
  // Materiality
  amount?: number;
  materialityThreshold?: number;
  // History
  isFirstTime?: boolean;
  historicalMatchCount?: number;
  // Persisted calibration
  patternKey?: string;
  persistedAdjustment?: number;
  categoryPaused?: boolean;
}

// ── Base scores per category ──

const BASE_SCORES: Record<ActionCategory, number> = {
  exact_match: 0.97,
  fuzzy_match: 0.80,
  grouped_match: 0.85,
  difference_match: 0.90,
  recurring_exact: 1.00,
  recurring_variable: 0.90,
  rule_application: 0.92,
  internal_transfer: 1.00,
  intercompany_exact: 1.00,
  intercompany_approx: 0.80,
  llm_classification: 0.70, // overridden by llmConfidence
  llm_match: 0.70,          // overridden by llmConfidence
  provision: 0.80,
  amortization: 1.00,
  periodification: 0.85,
  manual_journal: 0.00,
};

// Categories that NEVER auto-execute
const NEVER_AUTO = new Set<ActionCategory>(["periodification", "manual_journal"]);

// ── Main function ──

export function calculateConfidence(ctx: ConfidenceContext): ConfidenceResult {
  const { category, threshold } = ctx;
  const reasons: string[] = [];

  // Base score
  let base = BASE_SCORES[category];
  if ((category === "llm_classification" || category === "llm_match") && ctx.llmConfidence != null) {
    base = ctx.llmConfidence;
  }

  // Historical adjustments
  let historical = 0;

  if (category === "exact_match") {
    if (ctx.historicalMatchCount != null && ctx.historicalMatchCount > 10) {
      historical += 0.02;
      reasons.push(`+0.02: >10 matches sin error del mismo contacto`);
    }
    if (ctx.isFirstTime) {
      historical -= 0.05;
      reasons.push(`-0.05: primera vez con este contacto`);
    }
  }

  if (category === "fuzzy_match") {
    if (ctx.historicalMatchCount != null && ctx.historicalMatchCount > 5) {
      historical += 0.05;
      reasons.push(`+0.05: >5 fuzzy matches del mismo contacto`);
    }
    if (ctx.isFirstTime) {
      historical -= 0.05;
      reasons.push(`-0.05: primera vez con este contacto`);
    }
  }

  if (category === "grouped_match") {
    if (ctx.historicalMatchCount != null && ctx.historicalMatchCount > 3) {
      historical += 0.05;
      reasons.push(`+0.05: contacto con historial de agrupados`);
    }
    if (ctx.invoiceCount != null && ctx.invoiceCount > 3) {
      historical -= 0.05;
      reasons.push(`-0.05: >3 facturas agrupadas`);
    }
  }

  if (category === "difference_match") {
    if (ctx.discountFrequency != null && ctx.discountFrequency > 0) {
      const bonus = Math.min(0.08, 0.08 * ctx.discountFrequency);
      historical += bonus;
      reasons.push(`+${bonus.toFixed(2)}: patrón de descuento frecuente`);
    }
    if (ctx.isAtypical) {
      historical -= 0.15;
      reasons.push(`-0.15: descuento atípico`);
    }
  }

  if (category === "recurring_exact") {
    if (ctx.consecutiveCount != null && ctx.consecutiveCount < 6) {
      base = 0.90;
      reasons.push(`Base 0.90: <6 consecutivos`);
    }
  }

  if (category === "recurring_variable") {
    if (ctx.amountZScore != null) {
      if (Math.abs(ctx.amountZScore) <= 2) {
        historical += 0.06;
        reasons.push(`+0.06: dentro de media±2σ`);
      } else if (Math.abs(ctx.amountZScore) > 3) {
        historical -= 0.20;
        reasons.push(`-0.20: fuera de 3σ`);
      }
    }
  }

  if (category === "rule_application") {
    if (ctx.ruleErrorRate != null) {
      if (ctx.ruleErrorRate < 0.02) {
        historical += 0.06;
        reasons.push(`+0.06: error rate <2%`);
      } else if (ctx.ruleErrorRate > 0.08) {
        historical -= 0.10;
        reasons.push(`-0.10: error rate >8%`);
      }
    }
  }

  if (category === "intercompany_exact") {
    if (ctx.dateDiffDays != null) {
      if (ctx.dateDiffDays > 3) {
        historical -= 0.15;
        reasons.push(`-0.15: diferencia fecha >3 días`);
      } else if (ctx.dateDiffDays > 1) {
        historical -= 0.05;
        reasons.push(`-0.05: diferencia fecha >1 día`);
      }
    }
  }

  if (category === "intercompany_approx") {
    if (ctx.amountDiffPercent != null && ctx.amountDiffPercent > 1) {
      historical -= 0.10;
      reasons.push(`-0.10: diferencia importe >1%`);
    }
  }

  if (category === "provision") {
    if (ctx.priorProvisionCount != null && ctx.priorProvisionCount >= 3) {
      historical += 0.16;
      reasons.push(`+0.16: ≥3 provisiones previas del contacto`);
    }
  }

  if (category === "amortization") {
    if (ctx.monthsApproved != null && ctx.monthsApproved < 3) {
      base = 0.85;
      reasons.push(`Base 0.85: <3 meses aprobados`);
    }
  }

  // System checks multiplier (for LLM outputs)
  let systemChecks = 1.0;
  if (ctx.systemCheckMultiplier != null) {
    systemChecks = ctx.systemCheckMultiplier;
    if (systemChecks < 1.0) {
      reasons.push(`×${systemChecks.toFixed(2)}: system checks`);
    }
  }

  // Materiality adjustment
  let materiality = 0;
  if (ctx.amount != null && ctx.materialityThreshold != null) {
    if (Math.abs(ctx.amount) > ctx.materialityThreshold) {
      materiality = -0.03;
      reasons.push(`-0.03: importe supera materialidad`);
    }
  }

  // Persisted calibration adjustment
  if (ctx.persistedAdjustment != null && ctx.persistedAdjustment !== 0) {
    historical += ctx.persistedAdjustment;
    reasons.push(`${ctx.persistedAdjustment > 0 ? "+" : ""}${ctx.persistedAdjustment.toFixed(2)}: calibración persistida`);
  }

  // Final score
  const raw = (base + historical) * systemChecks + materiality;
  const final = Math.max(0, Math.min(1, Math.round(raw * 100) / 100));

  // Auto-execute decision — also blocked if category is paused
  const autoExecute = !NEVER_AUTO.has(category) && !ctx.categoryPaused && final >= threshold;

  // Build reasoning
  const reasoningParts = [`${category}: base=${base.toFixed(2)}`];
  if (reasons.length > 0) reasoningParts.push(reasons.join(", "));
  reasoningParts.push(`→ ${final.toFixed(2)} (umbral ${threshold.toFixed(2)})`);
  if (NEVER_AUTO.has(category)) reasoningParts.push("(nunca auto-ejecuta)");

  return {
    score: final,
    autoExecute,
    reasoning: reasoningParts.join(". "),
    factors: {
      base,
      historical,
      systemChecks,
      materiality,
      final,
    },
    category,
  };
}

// ── System checks for LLM outputs ──

export interface SystemCheckResult {
  allPassed: boolean;
  failed: string[];
  multiplier: number;
}

export async function runSystemChecks(
  accountCode: string,
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<SystemCheckResult> {
  const failed: string[] = [];

  // 1. account_exists
  const account = await db.account.findFirst({
    where: { code: accountCode, isActive: true },
  });
  if (!account) {
    failed.push("account_exists");
  }

  // 2. group_coherent — group 6 (expenses) only with negative txs, group 7 (income) only with positive
  if (account) {
    if (account.group === 6 && tx.amount > 0) {
      failed.push("group_coherent");
    }
    if (account.group === 7 && tx.amount < 0) {
      failed.push("group_coherent");
    }
  }

  // 3. amount_in_range — check against historical amounts for this account
  if (account) {
    const historicalTxs = await db.bankTransaction.findMany({
      where: {
        status: "CLASSIFIED",
        classification: { accountId: account.id },
        valueDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { amount: true },
    });

    if (historicalTxs.length >= 5) {
      const amounts = historicalTxs.map((t) => Math.abs(t.amount));
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const stdDev = Math.sqrt(
        amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length
      );

      if (stdDev > 0 && Math.abs(Math.abs(tx.amount) - mean) > 3 * stdDev) {
        failed.push("amount_in_range");
      }
    }
  }

  // 4. concept_similar — at least 1 similar concept in this account
  if (account) {
    const existingConcepts = await db.bankTransaction.findMany({
      where: {
        status: "CLASSIFIED",
        classification: { accountId: account.id },
        concept: { not: null },
      },
      select: { concept: true },
      take: 50,
    });

    if (existingConcepts.length > 0 && tx.concept) {
      const fuse = new Fuse(
        existingConcepts.map((t) => ({ text: t.concept! })),
        { keys: ["text"], threshold: 0.6 }
      );
      const matches = fuse.search(tx.concept);
      if (matches.length === 0) {
        failed.push("concept_similar");
      }
    }
  }

  // Multiplier: 0 → 1.0, 1 → 0.85, 2 → 0.70, 3+ → 0.50
  const multiplier =
    failed.length === 0
      ? 1.0
      : failed.length === 1
        ? 0.85
        : failed.length === 2
          ? 0.70
          : 0.50;

  return {
    allPassed: failed.length === 0,
    failed,
    multiplier,
  };
}
