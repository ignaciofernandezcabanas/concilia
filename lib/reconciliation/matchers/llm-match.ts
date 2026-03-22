import Anthropic from "@anthropic-ai/sdk";
import { withRateLimit } from "@/lib/ai/rate-limiter";
import type { BankTransaction, Invoice, Contact } from "@prisma/client";

export interface LlmMatchResult {
  invoiceId: string;
  confidence: number;
  matchReason: string;
  llmExplanation: string;
}

type InvoiceWithContact = Invoice & { contact: Contact | null };

const MODEL = "claude-sonnet-4-20250514";
const MAX_INVOICES_IN_PROMPT = 30;

/**
 * Uses Claude to match a bank transaction against a list of pending invoices.
 *
 * The LLM analyzes the transaction concept, counterpart information, amount,
 * and date to identify the most likely matching invoice.
 *
 * Confidence ranges from 0.60 to 0.80 depending on the LLM's own assessment.
 */
export async function findLlmMatch(
  tx: BankTransaction,
  pendingInvoices: InvoiceWithContact[],
  contacts: Contact[]
): Promise<LlmMatchResult | null> {
  if (pendingInvoices.length === 0) {
    return null;
  }

  const client = new Anthropic();

  // Prepare invoice list for the prompt (limit to avoid token bloat)
  const invoiceList = pendingInvoices.slice(0, MAX_INVOICES_IN_PROMPT);

  const invoiceSummary = invoiceList
    .map(
      (inv) =>
        `- ID: ${inv.id} | #${inv.number} | ${inv.type} | ${inv.totalAmount.toFixed(2)} EUR | ` +
        `Date: ${inv.issueDate.toISOString().slice(0, 10)} | ` +
        `Due: ${inv.dueDate?.toISOString().slice(0, 10) ?? "N/A"} | ` +
        `Contact: ${inv.contact?.name ?? "Unknown"} (CIF: ${inv.contact?.cif ?? "N/A"}, IBAN: ${inv.contact?.iban ?? "N/A"}) | ` +
        `Desc: ${inv.description ?? "N/A"}`
    )
    .join("\n");

  const txSummary =
    `Amount: ${tx.amount.toFixed(2)} EUR\n` +
    `Date: ${tx.valueDate.toISOString().slice(0, 10)}\n` +
    `Concept: ${tx.concept ?? "N/A"}\n` +
    `Parsed concept: ${tx.conceptParsed ?? "N/A"}\n` +
    `Counterpart IBAN: ${tx.counterpartIban ?? "N/A"}\n` +
    `Counterpart Name: ${tx.counterpartName ?? "N/A"}\n` +
    `Reference: ${tx.reference ?? "N/A"}`;

  const systemPrompt =
    `You are a financial reconciliation assistant for a Spanish company. ` +
    `Your task is to match a bank transaction with the most likely invoice from the list. ` +
    `Consider: amount similarity, counterpart identification (IBAN, CIF, name), ` +
    `date proximity, and concept/description matching. ` +
    `Respond in JSON only.`;

  const userPrompt =
    `Match this bank transaction to the most likely invoice.\n\n` +
    `BANK TRANSACTION:\n${txSummary}\n\n` +
    `PENDING INVOICES:\n${invoiceSummary}\n\n` +
    `Respond with a JSON object (no markdown):\n` +
    `{\n` +
    `  "matchedInvoiceId": "<invoice ID or null if no match>",\n` +
    `  "confidence": <0.0 to 1.0>,\n` +
    `  "reasoning": "<brief explanation>"\n` +
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

    // Parse the JSON response, handling possible markdown wrapping
    const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      matchedInvoiceId: string | null;
      confidence: number;
      reasoning: string;
    };

    if (!parsed.matchedInvoiceId) {
      return null;
    }

    // Validate that the invoice ID exists in our list
    const matchedInvoice = invoiceList.find(
      (inv) => inv.id === parsed.matchedInvoiceId
    );
    if (!matchedInvoice) {
      return null;
    }

    // Clamp confidence to the 0.60-0.80 range for LLM matches
    const confidence = Math.min(0.80, Math.max(0.60, parsed.confidence));

    return {
      invoiceId: parsed.matchedInvoiceId,
      confidence: Math.round(confidence * 100) / 100,
      matchReason: "llm_match",
      llmExplanation: parsed.reasoning,
    };
  } catch (error) {
    console.error("[findLlmMatch] LLM call failed:", error);
    return null;
  }
}
