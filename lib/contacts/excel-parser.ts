/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parse contacts from an Excel file.
 * Headers: Nombre, CIF, Tipo, Email, IBAN
 */

import ExcelJS from "exceljs";

export interface ParsedContactRow {
  name: string;
  cif: string | null;
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  email: string | null;
  iban: string | null;
}

export interface ContactParseResult {
  rows: ParsedContactRow[];
  errors: string[];
}

const CIF_REGEX = /^[A-HJNP-SUVW]\d{7}[0-9A-J]$|^\d{8}[A-Z]$|^[XYZ]\d{7}[A-Z]$/;

const TYPE_MAP: Record<string, "CUSTOMER" | "SUPPLIER" | "BOTH"> = {
  cliente: "CUSTOMER",
  customer: "CUSTOMER",
  proveedor: "SUPPLIER",
  supplier: "SUPPLIER",
  ambos: "BOTH",
  both: "BOTH",
};

export async function parseContactExcel(buffer: Buffer): Promise<ContactParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [] };

  const rows: ParsedContactRow[] = [];
  const errors: string[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const vals = (row.values as unknown[]).slice(1);
    const name = String(vals[0] ?? "").trim();
    const cif = vals[1] != null ? String(vals[1]).trim().toUpperCase() : null;
    const tipoRaw = String(vals[2] ?? "")
      .trim()
      .toLowerCase();
    const email = vals[3] != null ? String(vals[3]).trim() : null;
    const iban = vals[4] != null ? String(vals[4]).trim().replace(/\s/g, "").toUpperCase() : null;

    if (!name) {
      errors.push(`Fila ${rowNumber}: nombre vacío`);
      return;
    }

    if (cif && !CIF_REGEX.test(cif)) {
      errors.push(`Fila ${rowNumber}: CIF "${cif}" inválido`);
      return;
    }

    const type = TYPE_MAP[tipoRaw] ?? "SUPPLIER";

    rows.push({ name, cif, type, email, iban });
  });

  return { rows, errors };
}
