/**
 * Generates human-readable explanations for items that go to the controller's bandeja.
 *
 * Principles:
 * - Non-blocking: if it fails, the item goes to bandeja without explanation.
 * - Only for bandeja: auto-approved items don't need explanations.
 * - Rate limited: uses the same limiter as matcher/classifier.
 * - Brief: max 2-3 sentences.
 */

import Anthropic from "@anthropic-ai/sdk";
import { withRateLimit } from "@/lib/ai/rate-limiter";
import type { BankTransaction } from "@prisma/client";

const MODEL = "claude-sonnet-4-20250514";

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

const EXPLAINER_SYSTEM_PROMPT =
  `Eres un asistente financiero. Explica en 2-3 frases en español por qué un movimiento bancario necesita revisión humana.\n` +
  `Sé directo y conciso. Sin introducciones ni cortesía.\n` +
  `Usa lenguaje de negocio, no técnico. Di "cobro" no "transacción positiva".\n` +
  `Si hay una acción recomendada, sugiérela.`;

function buildExplainerPrompt(ctx: ExplainContext): string {
  const txType = ctx.tx.amount > 0 ? "cobro" : "pago";
  const absAmount = Math.abs(ctx.tx.amount).toFixed(2);

  let prompt =
    `MOVIMIENTO:\n` +
    `- Tipo: ${txType}\n` +
    `- Importe: ${absAmount} EUR\n` +
    `- Fecha: ${ctx.tx.valueDate.toISOString().slice(0, 10)}\n` +
    `- Concepto: ${ctx.tx.concept ?? "Sin concepto"}\n` +
    `- Contrapartida: ${ctx.tx.counterpartName ?? "Desconocida"} (${ctx.tx.counterpartIban ?? "sin IBAN"})\n\n` +
    `PROPUESTA DEL SISTEMA:\n` +
    `- Tipo de match: ${ctx.reconciliation.type}\n` +
    `- Confianza: ${(ctx.reconciliation.confidenceScore * 100).toFixed(0)}% (umbral: ${(ctx.threshold * 100).toFixed(0)}%)\n` +
    `- Razón: ${ctx.reconciliation.matchReason}\n`;

  if (ctx.invoice) {
    prompt +=
      `- Factura candidata: #${ctx.invoice.number} de ${ctx.invoice.contactName} por ${ctx.invoice.totalAmount.toFixed(2)} EUR\n`;
    if (ctx.reconciliation.difference != null && ctx.reconciliation.difference !== 0) {
      prompt += `- Diferencia: ${ctx.reconciliation.difference.toFixed(2)} EUR (${ctx.reconciliation.differenceReason ?? "sin causa identificada"})\n`;
    }
    if (ctx.invoice.dueDate) {
      prompt += `- Vencimiento factura: ${ctx.invoice.dueDate}\n`;
    }
  }

  if (Math.abs(ctx.tx.amount) > ctx.materialityThreshold) {
    prompt += `\nNOTA: El importe supera el umbral de materialidad (${ctx.materialityThreshold} EUR).\n`;
  }

  prompt += `\nExplica la razón PRINCIPAL por la que necesita revisión. Responde SOLO con el texto, sin JSON.`;

  return prompt;
}

/**
 * Generate a 2-3 sentence explanation in Spanish for why an item needs human review.
 * Returns null if generation fails. NON-BLOCKING.
 */
export async function generateExplanation(ctx: ExplainContext): Promise<string | null> {
  try {
    const response = await withRateLimit(() =>
      new Anthropic().messages.create({
        model: MODEL,
        max_tokens: 300,
        system: EXPLAINER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildExplainerPrompt(ctx) }],
      })
    );

    if (!response) return null;

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return text.trim() || null;
  } catch (err) {
    console.warn("[explainer] Failed to generate explanation:", err instanceof Error ? err.message : err);
    return null;
  }
}
