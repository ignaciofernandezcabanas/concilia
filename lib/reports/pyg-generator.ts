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
const EXPLOITATION_LINES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
];
const FINANCIAL_LINES = ["12", "13", "14", "15", "16"];

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generatePyG(
  db: ScopedPrisma,
  from: Date,
  to: Date,
  level: PyGLevel = "titles",
  includeEbitda: boolean = true
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
  const lineAmounts = new Map<
    string,
    Map<string, { amount: number; accountName: string }>
  >();

  // Helper to initialise line entries
  const addToLine = (
    pygLine: string,
    accountCode: string,
    accountName: string,
    amount: number
  ) => {
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

    addToLine(
      line.account.pygLine,
      line.account.code,
      line.account.name,
      amount
    );
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
  const resultadoEjercicio =
    resultadoAntesImpuestos + (lineTotals.get("17") ?? 0);

  // Line 1 is the revenue baseline for percentages
  const revenue = lineTotals.get("1") ?? 0;
  const pctOf = (amount: number): number | null =>
    revenue !== 0 ? (amount / Math.abs(revenue)) * 100 : null;

  // EBITDA: A.1 + amortización (line 8 is negative, so adding it back)
  const amortizacion = lineTotals.get("8") ?? 0;
  const ebitda = includeEbitda
    ? resultadoExplotacion - amortizacion
    : null;

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
            percentOverRevenue:
              pctOf(acctAmount) !== null
                ? roundTwo(pctOf(acctAmount)!)
                : null,
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
        percentOverRevenue: pctOf(resultadoEjercicio)
          ? roundTwo(pctOf(resultadoEjercicio)!)
          : null,
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
      percentOverRevenue: pctOf(resultadoFinanciero)
        ? roundTwo(pctOf(resultadoFinanciero)!)
        : null,
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
      percentOverRevenue: pctOf(resultadoEjercicio)
        ? roundTwo(pctOf(resultadoEjercicio)!)
        : null,
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
