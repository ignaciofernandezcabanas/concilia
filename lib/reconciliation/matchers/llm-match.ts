import { callAIJson } from "@/lib/ai/model-router";
import { MATCH_LLM } from "@/lib/ai/prompt-registry";
import { getRelevantContext, formatContextForPrompt } from "@/lib/ai/context-retriever";
import type { BankTransaction, Invoice, Contact } from "@prisma/client";
import type { ScopedPrisma } from "@/lib/db-scoped";

export interface LlmMatchResult {
  invoiceId: string;
  confidence: number;
  matchReason: string;
  llmExplanation: string;
}

type InvoiceWithContact = Invoice & { contact: Contact | null };

const MAX_INVOICES_IN_PROMPT = 30;

export async function findLlmMatch(
  tx: BankTransaction,
  pendingInvoices: InvoiceWithContact[],
  _contacts: Contact[],
  db?: ScopedPrisma
): Promise<LlmMatchResult | null> {
  if (pendingInvoices.length === 0) return null;

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

  // Retrieve controller context if db available
  let controllerContext: string | undefined;
  if (db) {
    const context = await getRelevantContext(tx, db, 5);
    const formatted = formatContextForPrompt(context);
    if (formatted) controllerContext = formatted;
  }

  try {
    const parsed = await callAIJson(
      "match_llm",
      MATCH_LLM.system,
      MATCH_LLM.buildUser({ txSummary, invoiceSummary, controllerContext }),
      MATCH_LLM.schema
    );

    if (!parsed || !parsed.matchedInvoiceId) return null;

    if (parsed.steps) {
      console.info(`[llm-match] CoT for tx ${tx.id}:`, JSON.stringify(parsed.steps).slice(0, 500));
    }

    const matchedInvoice = invoiceList.find((inv) => inv.id === parsed.matchedInvoiceId);
    if (!matchedInvoice) return null;

    const confidence = Math.min(0.8, Math.max(0.6, parsed.confidence));

    return {
      invoiceId: parsed.matchedInvoiceId,
      confidence: Math.round(confidence * 100) / 100,
      matchReason: "llm_match",
      llmExplanation: parsed.reasoning,
    };
  } catch (error) {
    console.error("[findLlmMatch] Failed:", error);
    return null;
  }
}
