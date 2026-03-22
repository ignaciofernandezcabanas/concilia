/**
 * LLM prompt templates for bank transaction analysis.
 *
 * These prompts are designed for Claude and expect structured JSON responses
 * wrapped in <json>...</json> tags.
 */

// ============================================================
// Concept Parsing
// ============================================================

export interface ParsedConcept {
  counterpartName: string | null;
  paymentMethod: string | null;
  reference: string | null;
  isRecurring: boolean;
  category: string | null;
  keywords: string[];
}

/**
 * Prompt to extract structured information from a raw bank transaction concept.
 */
export function conceptParsingPrompt(
  concept: string,
  amount: number,
  iban: string | null
): string {
  return `You are a financial analyst assistant specializing in Spanish banking.

Analyze the following bank transaction concept and extract structured information.

Transaction details:
- Concept: "${concept}"
- Amount: ${amount} EUR
- Counterpart IBAN: ${iban ?? "Unknown"}

Return a JSON object with the following fields:
- counterpartName: the name of the entity (person or company) involved, or null
- paymentMethod: one of "transfer", "direct_debit", "card", "check", "cash", "receipt", "other", or null
- reference: any invoice number, reference code, or identifier found in the concept, or null
- isRecurring: true if this appears to be a recurring payment (subscription, rent, salary, etc.)
- category: a high-level category like "payroll", "rent", "utilities", "insurance", "taxes", "supplier_payment", "client_collection", "financial", "internal_transfer", or null
- keywords: array of relevant extracted keywords (max 5)

Respond with ONLY the JSON wrapped in <json> tags. No explanation.

<json>
{...}
</json>`;
}

/**
 * Parse the LLM response for concept parsing.
 */
export function parseConceptResponse(text: string): ParsedConcept | null {
  const match = text.match(/<json>\s*([\s\S]*?)\s*<\/json>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return {
      counterpartName: parsed.counterpartName ?? null,
      paymentMethod: parsed.paymentMethod ?? null,
      reference: parsed.reference ?? null,
      isRecurring: Boolean(parsed.isRecurring),
      category: parsed.category ?? null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
    };
  } catch {
    return null;
  }
}

// ============================================================
// Account Classification
// ============================================================

export interface ClassificationResult {
  accountCode: string;
  accountName: string;
  cashflowType: string;
  confidence: number;
  reasoning: string;
}

interface HistoryEntry {
  concept: string;
  accountCode: string;
  accountName: string;
}

/**
 * Prompt to classify a bank transaction into a PGC account.
 */
export function classificationPrompt(
  concept: string,
  amount: number,
  parsed: ParsedConcept | null,
  type: "income" | "expense",
  history: HistoryEntry[]
): string {
  const historyBlock =
    history.length > 0
      ? `\nRecent similar classifications for this company:\n${history
          .map((h) => `- "${h.concept}" → ${h.accountCode} (${h.accountName})`)
          .join("\n")}\n`
      : "";

  const parsedBlock = parsed
    ? `\nParsed concept data:\n${JSON.stringify(parsed, null, 2)}\n`
    : "";

  return `You are an expert Spanish accountant classifying bank transactions under the Plan General Contable (PGC).

Transaction to classify:
- Concept: "${concept}"
- Amount: ${Math.abs(amount)} EUR
- Type: ${type}
${parsedBlock}${historyBlock}
Based on the PGC (Plan General Contable), determine the most appropriate account.

Common accounts for reference:
- Group 6 (Expenses): 621 (Arrendamientos), 622 (Reparaciones), 623 (Servicios profesionales), 625 (Primas de seguros), 626 (Servicios bancarios), 628 (Suministros), 629 (Otros servicios), 640 (Sueldos y salarios), 642 (Seguridad Social), 662 (Intereses de deudas), 669 (Otros gastos financieros)
- Group 7 (Income): 700 (Ventas de mercaderías), 705 (Prestaciones de servicios), 759 (Ingresos por servicios diversos), 762 (Ingresos de créditos), 769 (Otros ingresos financieros)

Return a JSON object:
- accountCode: the PGC account code (3-digit minimum)
- accountName: the account name in Spanish
- cashflowType: one of "OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"
- confidence: a number between 0 and 1
- reasoning: brief explanation (1-2 sentences) of why this classification was chosen

Respond with ONLY the JSON wrapped in <json> tags.

<json>
{...}
</json>`;
}

/**
 * Parse the LLM response for classification.
 */
export function parseClassificationResponse(
  text: string
): ClassificationResult | null {
  const match = text.match(/<json>\s*([\s\S]*?)\s*<\/json>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return {
      accountCode: String(parsed.accountCode),
      accountName: String(parsed.accountName),
      cashflowType: parsed.cashflowType ?? "OPERATING",
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      reasoning: String(parsed.reasoning ?? ""),
    };
  } catch {
    return null;
  }
}
