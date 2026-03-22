import Anthropic from "@anthropic-ai/sdk";
import { withRateLimit } from "@/lib/ai/rate-limiter";
import type { BankTransaction, CashflowType } from "@prisma/client";

export interface LlmClassificationResult {
  accountCode: string;
  accountName: string;
  cashflowType: CashflowType;
  confidence: number;
  llmExplanation: string;
}

export interface HistoricalClassification {
  concept: string;
  accountCode: string;
  accountName: string;
  cashflowType: CashflowType;
  amount: number;
}

const MODEL = "claude-sonnet-4-20250514";
const MAX_HISTORY_ITEMS = 20;

// ── Prompts ──

const CLASSIFIER_SYSTEM_PROMPT =
  `Eres un contable español experto en el Plan General Contable (PGC).\n` +
  `Tu tarea es clasificar un movimiento bancario en la cuenta PGC correcta y el tipo de cashflow.\n\n` +
  `REGLAS CRÍTICAS:\n` +
  `- Si dudas entre dos cuentas del mismo grupo (ej: 626 vs 629), elige la más genérica y baja el confidence a 0.65.\n` +
  `- Si dudas entre dos grupos distintos (ej: grupo 6 vs grupo 7), pon confidence < 0.60 para que un humano lo revise.\n` +
  `- Usa las clasificaciones históricas como precedente. Si transacciones similares se han clasificado en cuenta X, mantén la consistencia SALVO que haya una razón clara para cambiar.\n` +
  `- Tipos de cashflow: OPERATING (operativo, el más común), INVESTING (compraventa de activos), FINANCING (préstamos, ampliaciones de capital), INTERNAL (transferencias entre cuentas propias), NON_CASH (amortizaciones, provisiones).\n\n` +
  `Responde SOLO con JSON válido, sin markdown.`;

function buildClassifierUserPrompt(txSummary: string, historySummary: string): string {
  return (
    `Clasifica este movimiento bancario en la cuenta PGC y tipo de cashflow correcto.\n\n` +
    `MOVIMIENTO:\n${txSummary}\n\n` +
    `CLASIFICACIONES HISTÓRICAS SIMILARES:\n${historySummary}\n\n` +
    `RAZONA PASO A PASO antes de clasificar:\n\n` +
    `Paso 1 — NATURALEZA: ¿Es un gasto (grupo 6), ingreso (grupo 7), activo (grupo 2), o pasivo (grupo 1/4/5)? ¿Por qué?\n\n` +
    `Paso 2 — SUBGRUPO: Dentro del grupo, ¿qué subgrupo aplica? Por ejemplo, dentro del grupo 62 (servicios exteriores): 621 arrendamientos, 622 reparaciones, 623 servicios profesionales, 624 transportes, 625 seguros, 626 servicios bancarios, 627 publicidad, 628 suministros, 629 otros servicios.\n\n` +
    `Paso 3 — PRECEDENTE: ¿Las clasificaciones históricas similares sugieren una cuenta concreta? Si hay precedente claro, seguirlo salvo razón para cambiar. Si no hay precedente, indicarlo.\n\n` +
    `Paso 4 — CASHFLOW: ¿Es operativo (día a día del negocio), de inversión (compra/venta de activos), o de financiación (deuda, capital)?\n\n` +
    `Paso 5 — CONFIANZA: ¿Cuán seguro estás? Si has dudado entre dos opciones, el confidence debe reflejarlo.\n\n` +
    `Responde con JSON (sin markdown):\n` +
    `{\n` +
    `  "steps": {\n` +
    `    "nature": "...",\n` +
    `    "subgroup": "...",\n` +
    `    "precedent": "...",\n` +
    `    "cashflow_reasoning": "...",\n` +
    `    "confidence_reasoning": "..."\n` +
    `  },\n` +
    `  "accountCode": "...",\n` +
    `  "accountName": "...",\n` +
    `  "cashflowType": "OPERATING | INVESTING | FINANCING | INTERNAL | NON_CASH",\n` +
    `  "confidence": <0.0 a 1.0>,\n` +
    `  "reasoning": "<resumen de 1 frase en español>"\n` +
    `}`
  );
}

// ── Main function ──

export async function classifyByLlm(
  tx: BankTransaction,
  history: HistoricalClassification[]
): Promise<LlmClassificationResult | null> {
  const client = new Anthropic();

  const historySlice = history.slice(0, MAX_HISTORY_ITEMS);

  const historySummary =
    historySlice.length > 0
      ? historySlice
          .map(
            (h) =>
              `- Concept: "${h.concept}" | Amount: ${h.amount.toFixed(2)} EUR | ` +
              `Account: ${h.accountCode} (${h.accountName}) | Cashflow: ${h.cashflowType}`
          )
          .join("\n")
      : "No hay datos históricos disponibles.";

  const txSummary =
    `Amount: ${tx.amount.toFixed(2)} EUR\n` +
    `Date: ${tx.valueDate.toISOString().slice(0, 10)}\n` +
    `Concept: ${tx.concept ?? "N/A"}\n` +
    `Parsed concept: ${tx.conceptParsed ?? "N/A"}\n` +
    `Counterpart IBAN: ${tx.counterpartIban ?? "N/A"}\n` +
    `Counterpart Name: ${tx.counterpartName ?? "N/A"}\n` +
    `Reference: ${tx.reference ?? "N/A"}`;

  const userPrompt = buildClassifierUserPrompt(txSummary, historySummary);

  try {
    const response = await withRateLimit(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system: CLASSIFIER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
    );

    if (!response) return null;

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      steps?: {
        nature?: string;
        subgroup?: string;
        precedent?: string;
        cashflow_reasoning?: string;
        confidence_reasoning?: string;
      };
      accountCode: string;
      accountName: string;
      cashflowType: string;
      confidence: number;
      reasoning: string;
    };

    // Log CoT reasoning for debugging
    if (parsed.steps) {
      console.info(`[llm-classifier] CoT for tx ${tx.id}:`, JSON.stringify(parsed.steps).slice(0, 500));
    }

    // Validate cashflow type
    const validCashflowTypes: CashflowType[] = [
      "OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH",
    ];

    const cashflowType = validCashflowTypes.includes(
      parsed.cashflowType as CashflowType
    )
      ? (parsed.cashflowType as CashflowType)
      : "OPERATING";

    // Clamp confidence to 0.60-0.85 for LLM classifications
    const confidence = Math.min(0.85, Math.max(0.60, parsed.confidence));

    return {
      accountCode: parsed.accountCode,
      accountName: parsed.accountName,
      cashflowType,
      confidence: Math.round(confidence * 100) / 100,
      llmExplanation: parsed.reasoning,
    };
  } catch (error) {
    console.error("[classifyByLlm] LLM call failed:", error);
    return null;
  }
}
