import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { isNorma43, parseNorma43 } from "@/lib/bank/norma43-parser";

/**
 * POST /api/transactions/import
 *
 * Imports bank transactions from a CSV file.
 *
 * Accepts multipart/form-data with:
 *   - file: CSV file
 *   - separator: ";" | "," | "\t" (optional, auto-detected)
 *   - dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD" | "DD-MM-YYYY" (optional, auto-detected)
 *   - skipRows: number of header rows to skip (default: 0, auto-detected)
 *
 * Auto-detects column mapping by header names (Spanish bank formats).
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const { company, user } = ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba multipart/form-data con un archivo CSV." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No se encontró el archivo." }, { status: 400 });
  }

  const text = await file.text();
  if (!text.trim()) {
    return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  }

  // ── Auto-detect Norma43 ──
  if (isNorma43(text)) {
    try {
      const n43 = parseNorma43(text);
      let imported = 0;
      let skipped = 0;

      for (const tx of n43.transactions) {
        const externalId = `n43_${tx.date.toISOString().slice(0, 10)}_${tx.amount.toFixed(2)}_${tx.reference}`;
        const exists = await db.bankTransaction.findFirst({ where: { externalId } });
        if (exists) { skipped++; continue; }

        await db.bankTransaction.create({
          data: {
            externalId,
            valueDate: tx.date,
            bookingDate: tx.date,
            amount: tx.amount,
            currency: n43.currency,
            concept: tx.concept,
            reference: tx.reference || null,
            balanceAfter: null,
            status: "PENDING",
            companyId: company.id,
          } as any,
        });
        imported++;
      }

      createAuditLog(db, { userId: user.id, action: "TRANSACTIONS_IMPORTED_N43", entityType: "BankTransaction", entityId: "batch", details: { imported, skipped, total: n43.transactions.length } })
        .catch((err) => console.warn("[import] Audit failed:", err instanceof Error ? err.message : err));

      return NextResponse.json({
        success: true,
        format: "norma43",
        imported,
        skipped,
        total: n43.transactions.length,
        initialBalance: n43.initialBalance,
        finalBalance: n43.finalBalance,
        currency: n43.currency,
      });
    } catch (err) {
      return NextResponse.json({ error: `Error al parsear Norma43: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
    }
  }

  const separatorParam = formData.get("separator") as string | null;
  const dateFormatParam = formData.get("dateFormat") as string | null;

  // ── Auto-detect separator ──
  const separator = separatorParam || detectSeparator(text);

  // ── Parse lines ──
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim());
  if (rawLines.length < 2) {
    return NextResponse.json({ error: "El archivo debe tener al menos una fila de cabecera y una de datos." }, { status: 400 });
  }

  // ── Find header row (skip bank preamble lines) ──
  const { headerIndex, mapping } = detectHeader(rawLines, separator);
  if (headerIndex === -1 || !mapping) {
    return NextResponse.json({
      error: "No se pudieron detectar las columnas. Asegúrate de que el CSV tiene cabeceras como: Fecha, Concepto, Importe, Saldo.",
      hint: "Columnas detectadas: " + parseCsvLine(rawLines[0], separator).join(" | "),
    }, { status: 400 });
  }

  // ── Parse data rows ──
  const dataRows = rawLines.slice(headerIndex + 1);
  const dateFormat = dateFormatParam || detectDateFormat(dataRows, mapping.fecha, separator);

  const errors: string[] = [];

  // Phase 1: Parse all rows into memory
  interface ParsedRow {
    externalId: string;
    valueDate: Date;
    amount: number;
    concept: string | null;
    counterpart: string | null;
    reference: string | null;
    balanceAfter: number | null;
  }
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cols = parseCsvLine(dataRows[i], separator);
    if (cols.length <= Math.max(mapping.fecha, mapping.importe)) continue;

    try {
      const rawDate = cols[mapping.fecha]?.trim();
      const rawAmount = cols[mapping.importe]?.trim();
      const concept = cols[mapping.concepto]?.trim() || "";
      const rawBalance = mapping.saldo !== -1 ? cols[mapping.saldo]?.trim() : null;
      const reference = mapping.referencia !== -1 ? cols[mapping.referencia]?.trim() : null;
      const counterpart = mapping.contrapartida !== -1 ? cols[mapping.contrapartida]?.trim() : null;

      if (!rawDate || !rawAmount) continue;

      const valueDate = parseDate(rawDate, dateFormat);
      if (!valueDate) { errors.push(`Fila ${i + 2}: fecha inválida "${rawDate}"`); continue; }

      const amount = parseAmount(rawAmount);
      if (isNaN(amount)) { errors.push(`Fila ${i + 2}: importe inválido "${rawAmount}"`); continue; }

      const balanceAfter = rawBalance ? parseAmount(rawBalance) : null;
      const bal = (balanceAfter != null && !isNaN(balanceAfter)) ? balanceAfter : null;
      // Use balance as part of ID — it's unique per row in bank statements
      const balanceStr = bal != null ? bal.toFixed(2) : `row${i}`;
      const externalId = `csv_${valueDate.toISOString().slice(0, 10)}_${amount.toFixed(2)}_${balanceStr}`;

      parsed.push({ externalId, valueDate, amount, concept: concept || null, counterpart: counterpart || null, reference: reference || null, balanceAfter: bal });
    } catch (err) {
      errors.push(`Fila ${i + 2}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  // Phase 2: Check existing in one query
  const externalIds = parsed.map((p) => p.externalId);
  const existingTxs = await db.bankTransaction.findMany({
    where: { companyId: company.id, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existingTxs.map((t) => t.externalId));

  // Phase 3: Batch insert new rows
  const toCreate = parsed.filter((p) => !existingSet.has(p.externalId));
  const skipped = parsed.length - toCreate.length;

  if (toCreate.length > 0) {
    await db.bankTransaction.createMany({
      data: toCreate.map((row) => ({
        externalId: row.externalId,
        valueDate: row.valueDate,
        bookingDate: row.valueDate,
        amount: row.amount,
        currency: company.currency || "EUR",
        concept: row.concept,
        counterpartName: row.counterpart,
        reference: row.reference,
        balanceAfter: row.balanceAfter,
        status: "PENDING" as const,
        priority: "ROUTINE" as const,
        companyId: company.id,
      })),
      skipDuplicates: true,
    });
  }

  const created = toCreate.length;

  // Log
  await db.syncLog.create({
    data: {
      source: "csv_import",
      action: "import_transactions",
      status: errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      recordsProcessed: dataRows.length,
      recordsCreated: created,
      recordsUpdated: 0,
      errors: errors.length > 0 ? errors : undefined,
      completedAt: new Date(),
      companyId: company.id,
    },
  });

  createAuditLog(db, {
    userId: user.id,
    action: "TRANSACTIONS_CSV_IMPORT",
    entityType: "BankTransaction",
    entityId: "batch",
    details: { filename: file.name, created, skipped, errors: errors.length },
  }).catch((err) => console.warn("[import] Non-critical operation failed:", err instanceof Error ? err.message : err));

  return NextResponse.json({
    success: true,
    created,
    skipped,
    total: dataRows.length,
    errors: errors.slice(0, 20), // Limit error output
  });
}, "classify:transaction");

// ── CSV Parsing Helpers ──

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function detectSeparator(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const semicolons = (firstLines.match(/;/g) || []).length;
  const commas = (firstLines.match(/,/g) || []).length;
  const tabs = (firstLines.match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  if (semicolons >= commas) return ";";
  return ",";
}

// ── Column Detection ──

interface ColumnMapping {
  fecha: number;
  concepto: number;
  importe: number;
  saldo: number;      // -1 if not found
  referencia: number;  // -1 if not found
  contrapartida: number; // -1 if not found
}

const DATE_PATTERNS = /^(fecha|date|f\.?\s*valor|fecha\s*valor|value\s*date|f\.?\s*operaci[oó]n|fecha\s*operaci[oó]n|fecha\s*mov)/i;
const CONCEPT_PATTERNS = /^(concepto|descripci[oó]n|description|movimiento|detalle|observaciones|texto)/i;
const AMOUNT_PATTERNS = /^(importe|amount|cantidad|monto|valor|cargo\/abono|importe\s*\(eur\)|euros)/i;
const BALANCE_PATTERNS = /^(saldo|balance|saldo\s*disponible|saldo\s*contable)/i;
const REF_PATTERNS = /^(referencia|reference|ref|n[uú]mero|ref\.\s*mov)/i;
const COUNTERPART_PATTERNS = /^(beneficiario|ordenante|contrapartida|nombre|titular|pagador|destinatario)/i;

function detectHeader(lines: string[], sep: string): { headerIndex: number; mapping: ColumnMapping | null } {
  // Try each of the first 10 lines as potential header
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = parseCsvLine(lines[i], sep).map((c) => c.trim().replace(/^["']|["']$/g, ""));

    let fecha = -1, concepto = -1, importe = -1, saldo = -1, referencia = -1, contrapartida = -1;

    for (let j = 0; j < cols.length; j++) {
      const col = cols[j];
      if (fecha === -1 && DATE_PATTERNS.test(col)) fecha = j;
      else if (concepto === -1 && CONCEPT_PATTERNS.test(col)) concepto = j;
      else if (importe === -1 && AMOUNT_PATTERNS.test(col)) importe = j;
      else if (saldo === -1 && BALANCE_PATTERNS.test(col)) saldo = j;
      else if (referencia === -1 && REF_PATTERNS.test(col)) referencia = j;
      else if (contrapartida === -1 && COUNTERPART_PATTERNS.test(col)) contrapartida = j;
    }

    // Minimum: fecha + importe
    if (fecha !== -1 && importe !== -1) {
      // If no concepto column found, use the first text-like column that isn't date/amount
      if (concepto === -1) {
        for (let j = 0; j < cols.length; j++) {
          if (j !== fecha && j !== importe && j !== saldo && j !== referencia) {
            concepto = j;
            break;
          }
        }
      }
      return { headerIndex: i, mapping: { fecha, concepto, importe, saldo, referencia, contrapartida } };
    }
  }

  return { headerIndex: -1, mapping: null };
}

// ── Date Parsing ──

function detectDateFormat(rows: string[], dateCol: number, sep: string): string {
  for (const row of rows.slice(0, 5)) {
    const cols = parseCsvLine(row, sep);
    const val = cols[dateCol]?.trim();
    if (!val) continue;
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(val)) return "YYYY-MM-DD";
    if (/^\d{2}[-/]\d{2}[-/]\d{4}/.test(val)) return "DD/MM/YYYY";
    if (/^\d{2}[-/]\d{2}[-/]\d{2}$/.test(val)) return "DD/MM/YY";
  }
  return "DD/MM/YYYY";
}

function parseDate(raw: string, format: string): Date | null {
  const cleaned = raw.replace(/['"]/g, "").trim();
  let d: Date | null = null;

  if (format === "YYYY-MM-DD") {
    d = new Date(cleaned);
  } else if (format === "DD/MM/YYYY" || format === "DD-MM-YYYY") {
    const parts = cleaned.split(/[/-]/);
    if (parts.length === 3) {
      d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  } else if (format === "DD/MM/YY") {
    const parts = cleaned.split(/[/-]/);
    if (parts.length === 3) {
      const year = parseInt(parts[2]) + 2000;
      d = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }

  if (d && !isNaN(d.getTime())) return d;
  return null;
}

// ── Amount Parsing ──

function parseAmount(raw: string): number {
  // Strip currency codes/symbols (EUR, €, USD, $) glued to the number
  let cleaned = raw.replace(/['"]/g, "").trim();
  cleaned = cleaned.replace(/\s*(EUR|USD|GBP|CHF|€|\$|£)\s*/gi, "").trim();

  // Handle parentheses as negative: (1.234,56) → -1234.56
  const isNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNeg) cleaned = cleaned.slice(1, -1);

  // Detect EU format (1.234,56) vs US format (1,234.56)
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let num: number;
  if (lastComma > lastDot) {
    // EU format: dots are thousands, comma is decimal
    num = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  } else if (lastDot > lastComma) {
    // US format or single dot decimal
    num = parseFloat(cleaned.replace(/,/g, ""));
  } else {
    // No decimal separator found
    num = parseFloat(cleaned.replace(/[.,]/g, ""));
  }

  return isNeg ? -num : num;
}
