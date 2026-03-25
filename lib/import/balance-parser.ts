/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedAccount {
  code: string;
  name: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;
}

export interface ParsedBalance {
  accounts: ParsedAccount[];
  period: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

/**
 * Detect CSV separator by counting occurrences in the first line.
 */
export function detectSeparator(firstLine: string): string {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch in counts) counts[ch]++;
  }
  // Tab wins if present (less ambiguous), then semicolon, then comma
  if (counts["\t"] >= 2) return "\t";
  if (counts[";"] >= 2) return ";";
  if (counts[","] >= 2) return ",";
  // Default to semicolon (Spanish convention)
  return ";";
}

/**
 * Parse a Spanish-format amount string: "1.234,56" → 1234.56
 * Also handles plain numbers, negative with parentheses, and dash as zero.
 */
export function parseSpanishAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return 0;

  // Parentheses mean negative: (1.234,56) → -1234.56
  const isNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  let cleaned = isNegative ? trimmed.slice(1, -1) : trimmed;

  // Check for leading minus
  const hasLeadingMinus = cleaned.startsWith("-");
  if (hasLeadingMinus) cleaned = cleaned.slice(1);

  // Detect format: if last separator is comma and before it there's a dot → Spanish (1.234,56)
  // If last separator is dot and before it there's a comma → English (1,234.56)
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma > lastDot) {
    // Spanish: dots are thousands, comma is decimal
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // English: commas are thousands, dot is decimal
    normalized = cleaned.replace(/,/g, "");
  } else {
    // No separator or only one type
    normalized = cleaned.replace(/,/g, ".");
  }

  const value = parseFloat(normalized);
  if (isNaN(value)) return 0;
  return (isNegative || hasLeadingMinus ? -1 : 1) * value;
}

interface ColumnMapping {
  code: number;
  name: number;
  debit: number;
  credit: number;
  balance: number | null;
}

const CODE_PATTERNS = [
  /^c[uó]digo$/i,
  /^cuenta$/i,
  /^c[oó]d\.?\s*cuenta$/i,
  /^subcuenta$/i,
  /^n[uú]mero$/i,
  /^code$/i,
  /^account$/i,
];

const NAME_PATTERNS = [
  /^nombre$/i,
  /^descripci[oó]n$/i,
  /^nombre\s*cuenta$/i,
  /^denominaci[oó]n$/i,
  /^concepto$/i,
  /^name$/i,
];

const DEBIT_PATTERNS = [/^debe$/i, /^d[eé]bito$/i, /^debit$/i, /^cargos$/i];

const CREDIT_PATTERNS = [/^haber$/i, /^cr[eé]dito$/i, /^credit$/i, /^abonos$/i];

const BALANCE_PATTERNS = [/^saldo$/i, /^balance$/i, /^neto$/i];

function matchColumn(header: string, patterns: RegExp[]): boolean {
  const trimmed = header.trim();
  return patterns.some((p) => p.test(trimmed));
}

/**
 * Detect column indices from header row.
 */
export function detectColumns(headers: string[]): ColumnMapping | null {
  let code = -1;
  let name = -1;
  let debit = -1;
  let credit = -1;
  let balance: number | null = null;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (code === -1 && matchColumn(h, CODE_PATTERNS)) code = i;
    else if (name === -1 && matchColumn(h, NAME_PATTERNS)) name = i;
    else if (debit === -1 && matchColumn(h, DEBIT_PATTERNS)) debit = i;
    else if (credit === -1 && matchColumn(h, CREDIT_PATTERNS)) credit = i;
    else if (balance === null && matchColumn(h, BALANCE_PATTERNS)) balance = i;
  }

  if (code === -1 || name === -1 || debit === -1 || credit === -1) {
    return null;
  }

  return { code, name, debit, credit, balance };
}

/**
 * Parse a trial balance (sumas y saldos) CSV file.
 * Expected columns: Cuenta/Codigo, Nombre, Debe, Haber, [Saldo]
 */
export function parseBalanceCSV(content: string): ParsedBalance {
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    return {
      accounts: [],
      period: null,
      confidence: "low",
      warnings: ["Archivo vacío o con una sola línea"],
    };
  }

  const separator = detectSeparator(lines[0]);
  const headerRow = lines[0].split(separator).map((h) => h.trim().replace(/^"|"$/g, ""));

  const columns = detectColumns(headerRow);
  if (!columns) {
    return {
      accounts: [],
      period: null,
      confidence: "low",
      warnings: [
        "No se detectaron las columnas requeridas (cuenta, nombre, debe, haber). " +
          `Cabeceras encontradas: ${headerRow.join(", ")}`,
      ],
    };
  }

  // Try to detect period from filename or first rows
  let period: string | null = null;
  const periodPattern = /(\d{2})[\/\-](\d{4})/;
  const yearPattern = /\b(20\d{2})\b/;
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const pm = lines[i].match(periodPattern);
    if (pm) {
      period = `${pm[2]}-${pm[1]}`;
      break;
    }
    const ym = lines[i].match(yearPattern);
    if (ym && !period) {
      period = ym[1];
    }
  }

  const accounts: ParsedAccount[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(separator).map((f) => f.trim().replace(/^"|"$/g, ""));

    const code = fields[columns.code]?.trim() ?? "";
    const accountName = fields[columns.name]?.trim() ?? "";

    // Skip rows without a valid account code (at least 3 digits)
    if (!/^\d{3,}$/.test(code)) {
      if (code && /\d/.test(code)) {
        warnings.push(`Fila ${i + 1}: código "${code}" no es un código de cuenta válido`);
      }
      continue;
    }

    const debitTotal = parseSpanishAmount(fields[columns.debit] ?? "0");
    const creditTotal = parseSpanishAmount(fields[columns.credit] ?? "0");

    let netBalance: number;
    if (columns.balance !== null && fields[columns.balance]) {
      netBalance = parseSpanishAmount(fields[columns.balance]);
    } else {
      netBalance = debitTotal - creditTotal;
    }

    // Skip zero-balance accounts
    if (debitTotal === 0 && creditTotal === 0 && netBalance === 0) {
      continue;
    }

    accounts.push({
      code,
      name: accountName || `Cuenta ${code}`,
      debitTotal,
      creditTotal,
      netBalance,
    });
  }

  const confidence = accounts.length > 10 ? "high" : accounts.length > 0 ? "medium" : "low";

  if (accounts.length === 0) {
    warnings.push("No se encontraron cuentas válidas con saldo en el archivo");
  }

  return { accounts, period, confidence, warnings };
}
