/**
 * Invoice PDF data extractor using Claude AI.
 * Routes through the model router (Haiku for extraction).
 */

import { callAIWithDocument, callAIJson } from "@/lib/ai/model-router";
import { EXTRACT_INVOICE_PDF } from "@/lib/ai/prompt-registry";

export interface ExtractedInvoice {
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmount: number | null;
  netAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  currency: string;
  description: string | null;
  supplierName: string | null;
  supplierCif: string | null;
  type: "ISSUED" | "RECEIVED";
  confidence: number;
  lines: { description: string; quantity: number; unitPrice: number; total: number; vatRate: number }[];
}

export async function extractInvoiceFromPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<ExtractedInvoice> {
  const base64 = pdfBuffer.toString("base64");

  const text = await callAIWithDocument(
    "extract_invoice_pdf",
    EXTRACT_INVOICE_PDF.system,
    EXTRACT_INVOICE_PDF.buildUser({ filename }),
    base64,
    "application/pdf"
  );

  if (!text) {
    throw new Error("No se pudo extraer datos del PDF: LLM no respondió.");
  }

  try {
    // Clean and parse
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = EXTRACT_INVOICE_PDF.schema.safeParse(parsed);

    if (validated.success) {
      return validated.data as ExtractedInvoice;
    }

    // Fallback: manual mapping
    return {
      number: parsed.number ?? null,
      issueDate: parsed.issueDate ?? null,
      dueDate: parsed.dueDate ?? null,
      totalAmount: parsed.totalAmount ?? null,
      netAmount: parsed.netAmount ?? null,
      vatAmount: parsed.vatAmount ?? null,
      vatRate: parsed.vatRate ?? null,
      currency: parsed.currency ?? "EUR",
      description: parsed.description ?? null,
      supplierName: parsed.supplierName ?? null,
      supplierCif: parsed.supplierCif ?? null,
      type: parsed.type === "ISSUED" ? "ISSUED" : "RECEIVED",
      confidence: parsed.confidence ?? 0.5,
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
  } catch {
    throw new Error("No se pudo extraer datos del PDF: " + text.slice(0, 200));
  }
}
