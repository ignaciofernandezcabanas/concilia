/**
 * Generates human-readable explanations for items that go to the controller's bandeja.
 * Now uses Haiku via the model router (simple NLP task).
 */

import { callAI } from "@/lib/ai/model-router";
import { EXPLAIN_BANDEJA } from "@/lib/ai/prompt-registry";
import type { BankTransaction } from "@prisma/client";

export interface ExplainContext {
  tx: BankTransaction;
  reconciliation: {
    type: string;
    confidenceScore: number;
    matchReason: string;
    difference: number | null;
    differenceReason: string | null;
  };
  invoice?: {
    number: string;
    totalAmount: number;
    contactName: string;
    dueDate: string | null;
  } | null;
  threshold: number;
  materialityThreshold: number;
}

/**
 * Generate a 2-3 sentence explanation in Spanish for why an item needs human review.
 * Returns null if generation fails. NON-BLOCKING.
 */
export async function generateExplanation(ctx: ExplainContext): Promise<string | null> {
  try {
    const txType = ctx.tx.amount > 0 ? "cobro" : "pago";
    const absAmount = Math.abs(ctx.tx.amount).toFixed(2);

    const userPrompt = EXPLAIN_BANDEJA.buildUser({
      txType,
      amount: absAmount,
      date: ctx.tx.valueDate.toISOString().slice(0, 10),
      concept: ctx.tx.concept ?? "Sin concepto",
      counterpart: `${ctx.tx.counterpartName ?? "Desconocida"} (${ctx.tx.counterpartIban ?? "sin IBAN"})`,
      matchType: ctx.reconciliation.type,
      confidence: `${(ctx.reconciliation.confidenceScore * 100).toFixed(0)}%`,
      threshold: `${(ctx.threshold * 100).toFixed(0)}%`,
      matchReason: ctx.reconciliation.matchReason,
      invoice: ctx.invoice
        ? {
            number: ctx.invoice.number,
            contact: ctx.invoice.contactName,
            amount: ctx.invoice.totalAmount.toFixed(2),
            dueDate: ctx.invoice.dueDate ?? undefined,
            difference:
              ctx.reconciliation.difference != null && ctx.reconciliation.difference !== 0
                ? ctx.reconciliation.difference.toFixed(2)
                : undefined,
            differenceReason: ctx.reconciliation.differenceReason ?? undefined,
          }
        : undefined,
      materialityNote:
        Math.abs(ctx.tx.amount) > ctx.materialityThreshold
          ? `El importe supera el umbral de materialidad (${ctx.materialityThreshold} EUR).`
          : undefined,
    });

    return await callAI("explain_bandeja", EXPLAIN_BANDEJA.system, userPrompt);
  } catch (err) {
    console.warn("[explainer] Failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
