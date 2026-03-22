/**
 * Invoice PDF data extractor using Claude AI.
 *
 * Takes a PDF buffer, converts to base64, sends to Claude for analysis,
 * and returns structured invoice data.
 */


import { anthropic } from "@/lib/ai/client";

export interface ExtractedInvoice {
  number: string | null;
  issueDate: string | null;       // YYYY-MM-DD
  dueDate: string | null;         // YYYY-MM-DD
  totalAmount: number | null;
  netAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;          // 0.21, 0.10, 0.04
  currency: string;
  description: string | null;
  supplierName: string | null;
  supplierCif: string | null;
  type: "ISSUED" | "RECEIVED";
  confidence: number;              // 0-1
  lines: { description: string; quantity: number; unitPrice: number; total: number; vatRate: number }[];
}

export async function extractInvoiceFromPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<ExtractedInvoice> {
  const base64 = pdfBuffer.toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `Analiza esta factura y extrae los datos estructurados. Responde SOLO con JSON válido, sin markdown.

{
  "number": "número de factura",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD o null",
  "totalAmount": 1234.56,
  "netAmount": 1020.30,
  "vatAmount": 214.26,
  "vatRate": 0.21,
  "currency": "EUR",
  "description": "descripción breve del servicio/producto",
  "supplierName": "nombre del emisor",
  "supplierCif": "CIF/NIF del emisor (formato español: letra + 8 dígitos)",
  "type": "RECEIVED si es una factura que nos han emitido (gasto), ISSUED si la emitimos nosotros (ingreso)",
  "confidence": 0.95,
  "lines": [
    { "description": "concepto", "quantity": 1, "unitPrice": 100.00, "total": 121.00, "vatRate": 0.21 }
  ]
}

Notas:
- Los importes son numéricos (sin símbolo €)
- Si no encuentras un campo, usa null
- El CIF español es una letra seguida de 8 dígitos (ej: B12345678)
- vatRate es decimal: 21% = 0.21, 10% = 0.10, 4% = 0.04
- confidence: tu nivel de confianza en la extracción (0-1)
- Nombre del archivo: ${filename}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Try direct JSON parse
    const parsed = JSON.parse(text.trim());
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
    // Try extracting JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
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
    }
    throw new Error("No se pudo extraer datos del PDF: " + text.slice(0, 200));
  }
}
