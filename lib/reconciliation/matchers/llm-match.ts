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

// ── Prompts ──

const MATCHER_SYSTEM_PROMPT =
  `Eres un asistente de conciliación bancaria para una empresa española.\n` +
  `Tu tarea es analizar si un movimiento bancario corresponde a alguna de las facturas pendientes.\n\n` +
  `REGLAS CRÍTICAS:\n` +
  `- Es MEJOR devolver null (sin match) que forzar un match dudoso. Un falso positivo es peor que un falso negativo.\n` +
  `- Si hay duda entre dos facturas, devuelve la de mayor certeza SOLO si el confidence es >= 0.65. Si no, devuelve null.\n` +
  `- Nunca asumas que un match es correcto solo porque el importe es cercano. Necesitas al menos 2 señales coincidentes (importe + IBAN, importe + CIF, importe + referencia en concepto, etc.).\n` +
  `- El confidence que devuelvas debe reflejar tu certeza REAL. No infles el número.\n\n` +
  `Responde SOLO con JSON válido, sin markdown.`;

function buildMatcherUserPrompt(txSummary: string, invoiceSummary: string): string {
  return (
    `Analiza este movimiento bancario y decide si corresponde a alguna factura.\n\n` +
    `MOVIMIENTO BANCARIO:\n${txSummary}\n\n` +
    `FACTURAS PENDIENTES:\n${invoiceSummary}\n\n` +
    `RAZONA PASO A PASO antes de decidir:\n\n` +
    `Paso 1 — IMPORTE: ¿Alguna factura tiene un importe que coincide o es muy cercano al movimiento (±5%)? Lista las candidatas.\n\n` +
    `Paso 2 — CONTRAPARTIDA: ¿El IBAN, CIF o nombre del movimiento coincide con algún contacto de las facturas candidatas? Si no hay coincidencia de contrapartida, el match es muy débil.\n\n` +
    `Paso 3 — FECHA: ¿Las facturas candidatas tienen fecha de emisión o vencimiento cercana al movimiento? Un desfase de más de 90 días es sospechoso.\n\n` +
    `Paso 4 — CONCEPTO: ¿El concepto bancario contiene alguna referencia a un número de factura, nombre de cliente/proveedor, o descripción que coincida?\n\n` +
    `Paso 5 — DECISIÓN: Basándote en los pasos anteriores, ¿hay un match claro con al menos 2 señales coincidentes? Si no, devuelve null.\n\n` +
    `Paso 6 — CONFIDENCE: Asigna un confidence entre 0.0 y 1.0 que refleje tu certeza. Guía:\n` +
    `- 0.80: importe exacto + IBAN coincide\n` +
    `- 0.70: importe cercano + nombre coincide\n` +
    `- 0.65: solo importe coincide, sin otra señal\n` +
    `- < 0.60: devuelve null\n\n` +
    `Responde con JSON (sin markdown):\n` +
    `{\n` +
    `  "steps": {\n` +
    `    "amount_analysis": "...",\n` +
    `    "counterpart_analysis": "...",\n` +
    `    "date_analysis": "...",\n` +
    `    "concept_analysis": "...",\n` +
    `    "decision": "..."\n` +
    `  },\n` +
    `  "matchedInvoiceId": "<ID de la factura o null>",\n` +
    `  "confidence": <0.0 a 1.0>,\n` +
    `  "reasoning": "<resumen de 1 frase>"\n` +
    `}`
  );
}

// ── Main function ──

export async function findLlmMatch(
  tx: BankTransaction,
  pendingInvoices: InvoiceWithContact[],
  contacts: Contact[]
): Promise<LlmMatchResult | null> {
  if (pendingInvoices.length === 0) {
    return null;
  }

  const client = new Anthropic();

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

  const userPrompt = buildMatcherUserPrompt(txSummary, invoiceSummary);

  try {
    const response = await withRateLimit(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system: MATCHER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
    );

    if (!response) return null;

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      steps?: {
        amount_analysis?: string;
        counterpart_analysis?: string;
        date_analysis?: string;
        concept_analysis?: string;
        decision?: string;
      };
      matchedInvoiceId: string | null;
      confidence: number;
      reasoning: string;
    };

    // Log CoT reasoning for debugging
    if (parsed.steps) {
      console.info(`[llm-match] CoT for tx ${tx.id}:`, JSON.stringify(parsed.steps).slice(0, 500));
    }

    if (!parsed.matchedInvoiceId) {
      return null;
    }

    // Validate invoice ID exists in the list
    const matchedInvoice = invoiceList.find(
      (inv) => inv.id === parsed.matchedInvoiceId
    );
    if (!matchedInvoice) {
      return null;
    }

    // Clamp confidence to 0.60-0.80 for LLM matches
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
