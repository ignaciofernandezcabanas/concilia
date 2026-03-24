/**
 * P&L (PyG) Report Generator — PGC (Plan General Contable) format.
 *
 * Generates the Cuenta de Pérdidas y Ganancias from invoices (accrual basis)
 * and classified bank transactions.
 *
 * PGC Lines (1–17):
 *  1.  Importe neto cifra de negocios
 *  2.  Variación de existencias
 *  3.  Trabajos realizados por la empresa para su activo
 *  4.  Aprovisionamientos
 *  5.  Otros ingresos de explotación
 *  6.  Gastos de personal
 *  7.  Otros gastos de explotación
 *  8.  Amortización del inmovilizado
 *  9.  Imputación de subvenciones de inmovilizado no financiero
 * 10.  Excesos de provisiones
 * 11.  Deterioro y resultado por enajenaciones del inmovilizado
 * 12.  Ingresos financieros
 * 13.  Gastos financieros
 * 14.  Variación de valor razonable en instrumentos financieros
 * 15.  Diferencias de cambio
 * 16.  Deterioro y resultado por enajenaciones de instrumentos financieros
 * 17.  Impuesto sobre beneficios
 *
 * Aggregated results:
 *  A.1  Resultado de explotación (lines 1–11)
 *  A.2  Resultado financiero (lines 12–16)
 *  A.3  Resultado antes de impuestos (A.1 + A.2)
 *  A.4  Resultado del ejercicio (A.3 + line 17)
 *
 * EBITDA = A.1 + amortización (line 8, sign reversed since it's an expense)
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PyGLevel = "results" | "titles" | "groups" | "accounts";

export interface PyGLineDetail {
  /** PGC line number (1–17) or aggregated result code (A.1–A.4) */
  code: string;
  label: string;
  amount: number;
  /** Percentage over line 1 (Importe neto cifra de negocios) */
  percentOverRevenue: number | null;
  /** Sub-items when level is "groups" or "accounts" */
  children?: PyGLineDetail[];
  /** Comparison columns (only present when comparison is requested) */
  budget?: number;
  budgetVar?: number;
  budgetVarPct?: number | null;
  priorYear?: number;
  priorYearVar?: number;
  priorYearVarPct?: number | null;
  priorMonth?: number;
  priorMonthVar?: number;
  priorMonthVarPct?: number | null;
  pctOverRevenue?: number | null;
}

export interface PyGComparison {
  budget?: boolean;
  priorYear?: boolean;
  priorMonth?: boolean;
}

export interface PyGReport {
  from: string;
  to: string;
  level: PyGLevel;
  currency: string;
  lines: PyGLineDetail[];
  results: {
    resultadoExplotacion: number;
    resultadoFinanciero: number;
    resultadoAntesImpuestos: number;
    resultadoEjercicio: number;
    ebitda: number | null;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// PGC line labels
// ---------------------------------------------------------------------------

const PYG_LINE_LABELS: Record<string, string> = {
  "1": "Importe neto de la cifra de negocios",
  "2": "Variación de existencias de productos terminados y en curso",
  "3": "Trabajos realizados por la empresa para su activo",
  "4": "Aprovisionamientos",
  "5": "Otros ingresos de explotación",
  "6": "Gastos de personal",
  "7": "Otros gastos de explotación",
  "8": "Amortización del inmovilizado",
  "9": "Imputación de subvenciones de inmovilizado no financiero y otras",
  "10": "Excesos de provisiones",
  "11": "Deterioro y resultado por enajenaciones del inmovilizado",
  "12": "Ingresos financieros",
  "13": "Gastos financieros",
  "14": "Variación de valor razonable en instrumentos financieros",
  "15": "Diferencias de cambio",
  "16": "Deterioro y resultado por enajenaciones de instrumentos financieros",
  "17": "Impuesto sobre beneficios",
};

// Lines that contribute to each aggregated result
const EXPLOITATION_LINES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const FINANCIAL_LINES = ["12", "13", "14", "15", "16"];

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generatePyG(
  db: ScopedPrisma,
  from: Date,
  to: Date,
  level: PyGLevel = "titles",
  includeEbitda: boolean = true,
  comparison?: PyGComparison
): Promise<PyGReport> {
  // Fetch invoice lines with their PGC account mapping (accrual basis)
  const invoiceLines = await db.invoiceLine.findMany({
    where: {
      invoice: {
        issueDate: { gte: from, lte: to },
        status: { notIn: ["CANCELLED"] },
      },
      account: { isNot: null },
    },
    include: {
      account: true,
      invoice: { select: { type: true } },
    },
  });

  // Fetch classified bank transactions (for items without invoice mapping)
  const classifiedTx = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: "CLASSIFIED",
      classification: { isNot: null },
    },
    include: {
      classification: {
        include: { account: true },
      },
    },
  });

  // Build a map: pygLine -> { accountCode -> amount }
  const lineAmounts = new Map<string, Map<string, { amount: number; accountName: string }>>();

  // Helper to initialise line entries
  const addToLine = (pygLine: string, accountCode: string, accountName: string, amount: number) => {
    if (!lineAmounts.has(pygLine)) {
      lineAmounts.set(pygLine, new Map());
    }
    const accounts = lineAmounts.get(pygLine)!;
    const existing = accounts.get(accountCode);
    if (existing) {
      existing.amount += amount;
    } else {
      accounts.set(accountCode, { amount, accountName });
    }
  };

  // Process invoice lines
  for (const line of invoiceLines) {
    if (!line.account?.pygLine) continue;

    // For received invoices / credit notes received, amounts represent expenses
    // For issued invoices / credit notes issued, amounts represent income
    let amount = line.totalAmount;
    const invType = line.invoice.type;
    if (invType === "CREDIT_ISSUED" || invType === "CREDIT_RECEIVED") {
      amount = -amount;
    }
    // Received invoices (expenses) are typically already negative in PGC mapping
    // but we keep the sign as-is since the pygLine assignment determines the nature

    addToLine(line.account.pygLine, line.account.code, line.account.name, amount);
  }

  // Process classified bank transactions (for expenses without invoices)
  for (const tx of classifiedTx) {
    if (!tx.classification?.account?.pygLine) continue;
    addToLine(
      tx.classification.account.pygLine,
      tx.classification.account.code,
      tx.classification.account.name,
      tx.amount
    );
  }

  // Build line totals
  const lineTotals = new Map<string, number>();
  for (const [pygLine, accounts] of Array.from(lineAmounts)) {
    let total = 0;
    for (const { amount } of Array.from(accounts.values())) {
      total += amount;
    }
    lineTotals.set(pygLine, total);
  }

  // Calculate aggregated results
  const sumLines = (codes: string[]): number =>
    codes.reduce((sum, code) => sum + (lineTotals.get(code) ?? 0), 0);

  const resultadoExplotacion = sumLines(EXPLOITATION_LINES);
  const resultadoFinanciero = sumLines(FINANCIAL_LINES);
  const resultadoAntesImpuestos = resultadoExplotacion + resultadoFinanciero;
  const resultadoEjercicio = resultadoAntesImpuestos + (lineTotals.get("17") ?? 0);

  // Line 1 is the revenue baseline for percentages
  const revenue = lineTotals.get("1") ?? 0;
  const pctOf = (amount: number): number | null =>
    revenue !== 0 ? (amount / Math.abs(revenue)) * 100 : null;

  // EBITDA: A.1 + amortización (line 8 is negative, so adding it back)
  const amortizacion = lineTotals.get("8") ?? 0;
  const ebitda = includeEbitda ? resultadoExplotacion - amortizacion : null;

  // Build output lines based on requested level
  const buildLine = (code: string): PyGLineDetail => {
    const amount = lineTotals.get(code) ?? 0;
    const detail: PyGLineDetail = {
      code,
      label: PYG_LINE_LABELS[code] ?? `Línea ${code}`,
      amount: roundTwo(amount),
      percentOverRevenue: pctOf(amount) !== null ? roundTwo(pctOf(amount)!) : null,
    };

    if (level === "accounts" || level === "groups") {
      const accounts = lineAmounts.get(code);
      if (accounts && accounts.size > 0) {
        detail.children = Array.from(accounts.entries()).map(
          ([accountCode, { amount: acctAmount, accountName }]) => ({
            code: accountCode,
            label: `${accountCode} - ${accountName}`,
            amount: roundTwo(acctAmount),
            percentOverRevenue: pctOf(acctAmount) !== null ? roundTwo(pctOf(acctAmount)!) : null,
          })
        );
        detail.children.sort((a, b) => a.code.localeCompare(b.code));
      }
    }

    return detail;
  };

  let lines: PyGLineDetail[] = [];

  if (level === "results") {
    // Only aggregated results
    lines = [
      {
        code: "A.1",
        label: "Resultado de explotación",
        amount: roundTwo(resultadoExplotacion),
        percentOverRevenue: pctOf(resultadoExplotacion)
          ? roundTwo(pctOf(resultadoExplotacion)!)
          : null,
      },
      {
        code: "A.2",
        label: "Resultado financiero",
        amount: roundTwo(resultadoFinanciero),
        percentOverRevenue: pctOf(resultadoFinanciero)
          ? roundTwo(pctOf(resultadoFinanciero)!)
          : null,
      },
      {
        code: "A.3",
        label: "Resultado antes de impuestos",
        amount: roundTwo(resultadoAntesImpuestos),
        percentOverRevenue: pctOf(resultadoAntesImpuestos)
          ? roundTwo(pctOf(resultadoAntesImpuestos)!)
          : null,
      },
      {
        code: "A.4",
        label: "Resultado del ejercicio",
        amount: roundTwo(resultadoEjercicio),
        percentOverRevenue: pctOf(resultadoEjercicio) ? roundTwo(pctOf(resultadoEjercicio)!) : null,
      },
    ];
  } else {
    // Lines 1–17 with their sub-items depending on level
    for (let i = 1; i <= 17; i++) {
      lines.push(buildLine(String(i)));
    }

    // Append aggregated results after each section
    const a1: PyGLineDetail = {
      code: "A.1",
      label: "A.1) Resultado de explotación",
      amount: roundTwo(resultadoExplotacion),
      percentOverRevenue: pctOf(resultadoExplotacion)
        ? roundTwo(pctOf(resultadoExplotacion)!)
        : null,
    };
    const a2: PyGLineDetail = {
      code: "A.2",
      label: "A.2) Resultado financiero",
      amount: roundTwo(resultadoFinanciero),
      percentOverRevenue: pctOf(resultadoFinanciero) ? roundTwo(pctOf(resultadoFinanciero)!) : null,
    };
    const a3: PyGLineDetail = {
      code: "A.3",
      label: "A.3) Resultado antes de impuestos",
      amount: roundTwo(resultadoAntesImpuestos),
      percentOverRevenue: pctOf(resultadoAntesImpuestos)
        ? roundTwo(pctOf(resultadoAntesImpuestos)!)
        : null,
    };
    const a4: PyGLineDetail = {
      code: "A.4",
      label: "A.4) Resultado del ejercicio",
      amount: roundTwo(resultadoEjercicio),
      percentOverRevenue: pctOf(resultadoEjercicio) ? roundTwo(pctOf(resultadoEjercicio)!) : null,
    };

    // Insert aggregated lines at proper positions
    // After line 11 → A.1, after line 16 → A.2, then A.3, after line 17 → A.4
    const result: PyGLineDetail[] = [];
    for (const line of lines) {
      result.push(line);
      if (line.code === "11") result.push(a1);
      if (line.code === "16") {
        result.push(a2);
        result.push(a3);
      }
      if (line.code === "17") result.push(a4);
    }
    lines = result;
  }

  // Append EBITDA if requested
  if (ebitda !== null) {
    lines.push({
      code: "EBITDA",
      label: "EBITDA",
      amount: roundTwo(ebitda),
      percentOverRevenue: pctOf(ebitda) ? roundTwo(pctOf(ebitda)!) : null,
    });
  }

  // =========================================================================
  // Comparison columns
  // =========================================================================

  if (comparison) {
    // Build a lookup: code → amount from a comparison PyG report
    const buildLookup = (report: PyGReport): Map<string, number> => {
      const map = new Map<string, number>();
      for (const line of report.lines) {
        map.set(line.code, line.amount);
      }
      return map;
    };

    // Budget comparison — query BudgetLine for matching period and accounts
    if (comparison.budget) {
      const budgetAmounts = await loadBudgetAmounts(db, from, to, lineTotals, lineAmounts);
      for (const line of lines) {
        const budgetAmt = budgetAmounts.get(line.code);
        if (budgetAmt !== undefined) {
          line.budget = roundTwo(budgetAmt);
          line.budgetVar = roundTwo(line.amount - budgetAmt);
          line.budgetVarPct = calculateVarPct(line.amount, budgetAmt);
        }
      }
    }

    // Prior year comparison — recursive call with dates shifted -12 months
    if (comparison.priorYear) {
      const priorFrom = new Date(from);
      priorFrom.setFullYear(priorFrom.getFullYear() - 1);
      const priorTo = new Date(to);
      priorTo.setFullYear(priorTo.getFullYear() - 1);
      const priorReport = await generatePyG(db, priorFrom, priorTo, level, includeEbitda);
      const priorLookup = buildLookup(priorReport);
      for (const line of lines) {
        const priorAmt = priorLookup.get(line.code);
        if (priorAmt !== undefined) {
          line.priorYear = roundTwo(priorAmt);
          line.priorYearVar = roundTwo(line.amount - priorAmt);
          line.priorYearVarPct = calculateVarPct(line.amount, priorAmt);
        }
      }
    }

    // Prior month comparison — recursive call with prior month dates
    if (comparison.priorMonth) {
      const priorMonthFrom = new Date(from);
      priorMonthFrom.setMonth(priorMonthFrom.getMonth() - 1);
      const priorMonthTo = new Date(to);
      priorMonthTo.setMonth(priorMonthTo.getMonth() - 1);
      const priorMonthReport = await generatePyG(
        db,
        priorMonthFrom,
        priorMonthTo,
        level,
        includeEbitda
      );
      const priorMonthLookup = buildLookup(priorMonthReport);
      for (const line of lines) {
        const priorAmt = priorMonthLookup.get(line.code);
        if (priorAmt !== undefined) {
          line.priorMonth = roundTwo(priorAmt);
          line.priorMonthVar = roundTwo(line.amount - priorAmt);
          line.priorMonthVarPct = calculateVarPct(line.amount, priorAmt);
        }
      }
    }
  }

  // Always calculate pctOverRevenue on each line
  for (const line of lines) {
    line.pctOverRevenue = revenue !== 0 ? roundTwo((line.amount / Math.abs(revenue)) * 100) : null;
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    level,
    currency: "EUR",
    lines,
    results: {
      resultadoExplotacion: roundTwo(resultadoExplotacion),
      resultadoFinanciero: roundTwo(resultadoFinanciero),
      resultadoAntesImpuestos: roundTwo(resultadoAntesImpuestos),
      resultadoEjercicio: roundTwo(resultadoEjercicio),
      ebitda: ebitda !== null ? roundTwo(ebitda) : null,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate variation percentage: (actual - comparison) / |comparison| * 100.
 * Returns null if comparison is 0 to avoid division by zero.
 */
export function calculateVarPct(actual: number, comparison: number): number | null {
  if (comparison === 0) return null;
  return roundTwo(((actual - comparison) / Math.abs(comparison)) * 100);
}

/**
 * Calculate pctOverRevenue: amount / |revenue| * 100.
 * Returns null if revenue is 0.
 */
export function calculatePctOverRevenue(amount: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return roundTwo((amount / Math.abs(revenue)) * 100);
}

/**
 * Calculates variation fields for comparison columns.
 * Exported for testing.
 */
export function calculateVariations(
  actual: number,
  comparison: number
): { variance: number; variancePct: number | null } {
  return {
    variance: roundTwo(actual - comparison),
    variancePct: calculateVarPct(actual, comparison),
  };
}

/**
 * Load budget amounts aggregated per PGC line for the given period.
 * Returns a map: pygLine code → budget amount.
 */
async function loadBudgetAmounts(
  db: ScopedPrisma,
  from: Date,
  to: Date,
  _lineTotals: Map<string, number>,
  lineAmounts: Map<string, Map<string, { amount: number; accountName: string }>>
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Find approved budgets for the year range
  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const budgets = await (db as any).budget.findMany({
    where: {
      year: { gte: fromYear, lte: toYear },
      status: "APPROVED",
    },
    include: { lines: true },
  });

  if (budgets.length === 0) return result;

  // Build accountCode → pygLine mapping from the actual data
  const accountToPygLine = new Map<string, string>();
  for (const [pygLine, accounts] of Array.from(lineAmounts)) {
    for (const accountCode of Array.from(accounts.keys())) {
      accountToPygLine.set(accountCode, pygLine);
    }
  }

  // Also fetch accounts to map budget line account codes to pygLine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = await (db as any).account.findMany({
    where: { pygLine: { not: null } },
    select: { code: true, pygLine: true },
  });
  for (const acct of accounts) {
    if (acct.pygLine) {
      accountToPygLine.set(acct.code, acct.pygLine);
    }
  }

  // Aggregate budget lines per pygLine for the matching months
  for (const budget of budgets) {
    for (const line of budget.lines) {
      // Filter by month range
      const lineMonth = line.month;
      const lineYear = budget.year;
      const lineDate = new Date(lineYear, lineMonth - 1, 1);
      if (lineDate < from || lineDate > to) continue;

      const pygLine = accountToPygLine.get(line.accountCode);
      if (!pygLine) continue;

      result.set(pygLine, (result.get(pygLine) ?? 0) + line.amount);
    }
  }

  return result;
}
