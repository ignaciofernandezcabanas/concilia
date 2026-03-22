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

/**
 * Uses Claude to classify a bank transaction into a PGC (Plan General Contable)
 * account and cashflow category.
 *
 * The LLM receives the transaction details plus similar historical classifications
 * to provide consistent categorization.
 *
 * Confidence ranges from 0.60 to 0.85 depending on the LLM's own assessment.
 */
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
      : "No historical data available.";

  const txSummary =
    `Amount: ${tx.amount.toFixed(2)} EUR\n` +
    `Date: ${tx.valueDate.toISOString().slice(0, 10)}\n` +
    `Concept: ${tx.concept ?? "N/A"}\n` +
    `Parsed concept: ${tx.conceptParsed ?? "N/A"}\n` +
    `Counterpart IBAN: ${tx.counterpartIban ?? "N/A"}\n` +
    `Counterpart Name: ${tx.counterpartName ?? "N/A"}\n` +
    `Reference: ${tx.reference ?? "N/A"}`;

  const systemPrompt =
    `You are a Spanish accounting expert specializing in the Plan General Contable (PGC). ` +
    `Your task is to classify a bank transaction into the correct PGC account and cashflow type. ` +
    `Use the historical classifications for consistency. ` +
    `Available cashflow types: OPERATING, INVESTING, FINANCING, INTERNAL, NON_CASH. ` +
    `Respond in JSON only.`;

  const userPrompt =
    `Classify this bank transaction into the appropriate PGC account.\n\n` +
    `BANK TRANSACTION:\n${txSummary}\n\n` +
    `SIMILAR HISTORICAL CLASSIFICATIONS:\n${historySummary}\n\n` +
    `Respond with a JSON object (no markdown):\n` +
    `{\n` +
    `  "accountCode": "<PGC account code, e.g., '629'>",\n` +
    `  "accountName": "<account name in Spanish>",\n` +
    `  "cashflowType": "<one of: OPERATING, INVESTING, FINANCING, INTERNAL, NON_CASH>",\n` +
    `  "confidence": <0.0 to 1.0>,\n` +
    `  "reasoning": "<brief explanation in Spanish>"\n` +
    `}`;

  try {
    const response = await withRateLimit(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      })
    );

    if (!response) return null; // Circuit broken or rate limited

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      accountCode: string;
      accountName: string;
      cashflowType: string;
      confidence: number;
      reasoning: string;
    };

    // Validate cashflow type
    const validCashflowTypes: CashflowType[] = [
      "OPERATING",
      "INVESTING",
      "FINANCING",
      "INTERNAL",
      "NON_CASH",
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
