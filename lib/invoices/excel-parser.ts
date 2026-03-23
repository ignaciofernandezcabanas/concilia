/**
 * Parse invoices from an Excel file.
 * Headers: Número, Tipo, Fecha emisión, Importe total, Base imponible, IVA, Contacto, CIF contacto
 */

import ExcelJS from "exceljs";

export interface ParsedInvoiceRow {
  number: string;
  type: "ISSUED" | "RECEIVED";
  issueDate: Date;
  totalAmount: number;
  netAmount: number | null;
  vatAmount: number | null;
  contactName: string | null;
  contactCif: string | null;
}

export interface InvoiceParseResult {
  rows: ParsedInvoiceRow[];
  errors: string[];
}

const TYPE_MAP: Record<string, "ISSUED" | "RECEIVED"> = {
  emitida: "ISSUED", issued: "ISSUED", venta: "ISSUED",
  recibida: "RECEIVED", received: "RECEIVED", compra: "RECEIVED", gasto: "RECEIVED",
};

export async function parseInvoiceExcel(buffer: Buffer): Promise<InvoiceParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [] };

  const rows: ParsedInvoiceRow[] = [];
  const errors: string[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const vals = (row.values as unknown[]).slice(1); // exceljs is 1-indexed
    const numero = String(vals[0] ?? "").trim();
    const tipo = String(vals[1] ?? "").trim().toLowerCase();
    const fechaRaw = vals[2];
    const importe = parseFloat(String(vals[3] ?? ""));
    const base = vals[4] != null ? parseFloat(String(vals[4])) : null;
    const iva = vals[5] != null ? parseFloat(String(vals[5])) : null;
    const contacto = vals[6] != null ? String(vals[6]).trim() : null;
    const cif = vals[7] != null ? String(vals[7]).trim() : null;

    if (!numero) {
      errors.push(`Fila ${rowNumber}: número de factura vacío`);
      return;
    }

    if (isNaN(importe)) {
      errors.push(`Fila ${rowNumber}: importe no numérico`);
      return;
    }

    const type = TYPE_MAP[tipo];
    if (!type) {
      errors.push(`Fila ${rowNumber}: tipo "${tipo}" no reconocido (usa EMITIDA o RECIBIDA)`);
      return;
    }

    let issueDate: Date;
    if (fechaRaw instanceof Date) {
      issueDate = fechaRaw;
    } else {
      const parsed = parseSpanishDate(String(fechaRaw ?? ""));
      if (!parsed) {
        errors.push(`Fila ${rowNumber}: fecha "${fechaRaw}" no válida`);
        return;
      }
      issueDate = parsed;
    }

    rows.push({
      number: numero,
      type,
      issueDate,
      totalAmount: importe,
      netAmount: base != null && !isNaN(base) ? base : null,
      vatAmount: iva != null && !isNaN(iva) ? iva : null,
      contactName: contacto || null,
      contactCif: cif || null,
    });
  });

  return { rows, errors };
}

function parseSpanishDate(s: string): Date | null {
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  return null;
}
