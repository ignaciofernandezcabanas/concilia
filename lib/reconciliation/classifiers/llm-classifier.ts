import { callAIJson } from "@/lib/ai/model-router";
import { CLASSIFY_LLM } from "@/lib/ai/prompt-registry";
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

const MAX_HISTORY_ITEMS = 20;

export async function classifyByLlm(
  tx: BankTransaction,
  history: HistoricalClassification[]
): Promise<LlmClassificationResult | null> {
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

  try {
    const parsed = await callAIJson(
      "classify_llm",
      CLASSIFY_LLM.system,
      CLASSIFY_LLM.buildUser({ txSummary, historySummary }),
      CLASSIFY_LLM.schema
    );

    if (!parsed) return null;

    // Log CoT
    if (parsed.steps) {
      console.info(
        `[llm-classifier] CoT for tx ${tx.id}:`,
        JSON.stringify(parsed.steps).slice(0, 500)
      );
    }

    // Validate cashflow type
    const validTypes: CashflowType[] = [
      "OPERATING",
      "INVESTING",
      "FINANCING",
      "INTERNAL",
      "NON_CASH",
    ];
    const cashflowType = validTypes.includes(parsed.cashflowType as CashflowType)
      ? (parsed.cashflowType as CashflowType)
      : "OPERATING";

    // Clamp confidence to 0.60-0.85
    const confidence = Math.min(0.85, Math.max(0.6, parsed.confidence));

    return {
      accountCode: parsed.accountCode,
      accountName: parsed.accountName,
      cashflowType,
      confidence: Math.round(confidence * 100) / 100,
      llmExplanation: parsed.reasoning,
    };
  } catch (error) {
    console.error("[classifyByLlm] Failed:", error);
    return null;
  }
}
