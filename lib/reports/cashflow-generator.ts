/**
 * Cash Flow Report Generator.
 *
 * Two modes:
 *
 * 1. **Treasury (direct) mode** — built directly from bank transactions (cash basis).
 *    Groups by month and category (cobros clientes, pagos proveedores, nóminas, etc.).
 *    Calculates saldo inicial, saldo final, diferencia neta per period.
 *
 * 2. **EFE (indirect) mode** — formal Estado de Flujos de Efectivo.
 *    Starts from A.3 (resultado antes de impuestos from PyG),
 *    adjusts for non-cash items (amortisation, provisions),
 *    accounts for working capital changes (deudores, acreedores),
 *    then adds investment and financing flows.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { generatePyG } from "./pyg-generator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CashflowMode = "direct" | "indirect";

/** Treasury (direct) mode types */

export interface TreasuryCategoryRow {
  category: string;
  amount: number;
}

export interface TreasuryMonth {
  month: string; // "2026-01"
  saldoInicial: number;
  cobrosClientes: number;
  pagosProveedores: number;
  nominas: number;
  impuestos: number;
  otrosIngresos: number;
  otrosGastos: number;
  inversionesNetas: number;
  financiacionNeta: number;
  movimientosInternos: number;
  diferenciaNeta: number;
  saldoFinal: number;
  details: TreasuryCategoryRow[];
}

export interface TreasuryReport {
  mode: "direct";
  from: string;
  to: string;
  currency: string;
  months: TreasuryMonth[];
  totals: {
    totalCobros: number;
    totalPagos: number;
    diferenciaNeta: number;
    saldoInicial: number;
    saldoFinal: number;
  };
  generatedAt: string;
}

/** EFE (indirect) mode types */

export interface EFESection {
  code: string;
  label: string;
  amount: number;
  children?: { label: string; amount: number }[];
}

export interface EFEReport {
  mode: "indirect";
  from: string;
  to: string;
  currency: string;
  sections: EFESection[];
  totals: {
    flujosExplotacion: number;
    flujosInversion: number;
    flujosFinanciacion: number;
    aumentoDisminucionEfectivo: number;
    efectivoInicio: number;
    efectivoFinal: number;
  };
  generatedAt: string;
}

export type CashflowReport = TreasuryReport | EFEReport;

// ---------------------------------------------------------------------------
// Category classification based on cashflowType + PGC groups
// ---------------------------------------------------------------------------

type TxCategory =
  | "cobrosClientes"
  | "pagosProveedores"
  | "nominas"
  | "impuestos"
  | "otrosIngresos"
  | "otrosGastos"
  | "inversionesNetas"
  | "financiacionNeta"
  | "movimientosInternos";

function classifyTransaction(
  amount: number,
  cashflowType: string | null,
  accountCode: string | null
): TxCategory {
  if (cashflowType === "INTERNAL") return "movimientosInternos";
  if (cashflowType === "INVESTING") return "inversionesNetas";
  if (cashflowType === "FINANCING") return "financiacionNeta";

  // PGC-based heuristics for operating transactions
  if (accountCode) {
    const group = parseInt(accountCode.charAt(0), 10);
    const subgroup = parseInt(accountCode.substring(0, 2), 10);

    // Group 64x = gastos de personal (nóminas)
    if (subgroup >= 64 && subgroup <= 64) return "nominas";
    // 640-649 personal expenses
    if (
      accountCode.startsWith("640") ||
      accountCode.startsWith("641") ||
      accountCode.startsWith("642") ||
      accountCode.startsWith("649")
    ) {
      return "nominas";
    }

    // Group 47x = Hacienda Pública (impuestos)
    if (subgroup === 47) return "impuestos";
    // 473, 475, 4750, 4751 = taxes
    if (accountCode.startsWith("473") || accountCode.startsWith("475")) {
      return "impuestos";
    }

    // Income accounts (group 7) = ingresos
    if (group === 7) {
      return amount >= 0 ? "cobrosClientes" : "otrosGastos";
    }

    // Expense accounts (group 6) = gastos
    if (group === 6) {
      return "pagosProveedores";
    }
  }

  // Default: classify by sign
  if (amount >= 0) return "otrosIngresos";
  return "otrosGastos";
}

// ---------------------------------------------------------------------------
// Treasury (direct) mode
// ---------------------------------------------------------------------------

async function generateTreasuryReport(
  db: ScopedPrisma,
  from: Date,
  to: Date
): Promise<TreasuryReport> {
  const transactions = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    include: {
      classification: {
        include: { account: true },
      },
    },
    orderBy: { valueDate: "asc" },
  });

  // Get the opening balance: the balanceAfter of the most recent transaction
  // before the reporting period
  const lastTxBefore = await db.bankTransaction.findFirst({
    where: {
      valueDate: { lt: from },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });

  const openingBalance = lastTxBefore?.balanceAfter ?? 0;

  // Group transactions by month
  const monthMap = new Map<string, typeof transactions>();

  for (const tx of transactions) {
    const monthKey = tx.valueDate.toISOString().slice(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, []);
    }
    monthMap.get(monthKey)!.push(tx);
  }

  // Sort months chronologically
  const sortedMonths = Array.from(monthMap.keys()).sort();

  let runningBalance = openingBalance;
  const months: TreasuryMonth[] = [];

  for (const monthKey of sortedMonths) {
    const monthTxs = monthMap.get(monthKey)!;
    const saldoInicial = runningBalance;

    const buckets: Record<TxCategory, number> = {
      cobrosClientes: 0,
      pagosProveedores: 0,
      nominas: 0,
      impuestos: 0,
      otrosIngresos: 0,
      otrosGastos: 0,
      inversionesNetas: 0,
      financiacionNeta: 0,
      movimientosInternos: 0,
    };

    const details: TreasuryCategoryRow[] = [];

    for (const tx of monthTxs) {
      const cashflowType = tx.classification?.cashflowType ?? null;
      const accountCode = tx.classification?.account?.code ?? null;
      const category = classifyTransaction(tx.amount, cashflowType, accountCode);
      buckets[category] += tx.amount;
    }

    // Build details array from non-zero buckets
    const categoryLabels: Record<TxCategory, string> = {
      cobrosClientes: "Cobros de clientes",
      pagosProveedores: "Pagos a proveedores",
      nominas: "Nóminas y SS",
      impuestos: "Impuestos",
      otrosIngresos: "Otros ingresos",
      otrosGastos: "Otros gastos",
      inversionesNetas: "Inversiones netas",
      financiacionNeta: "Financiación neta",
      movimientosInternos: "Movimientos internos",
    };

    for (const [cat, amount] of Object.entries(buckets)) {
      if (amount !== 0) {
        details.push({
          category: categoryLabels[cat as TxCategory],
          amount: roundTwo(amount),
        });
      }
    }

    const diferenciaNeta = Object.values(buckets).reduce((s, v) => s + v, 0);
    const saldoFinal = saldoInicial + diferenciaNeta;
    runningBalance = saldoFinal;

    months.push({
      month: monthKey,
      saldoInicial: roundTwo(saldoInicial),
      cobrosClientes: roundTwo(buckets.cobrosClientes),
      pagosProveedores: roundTwo(buckets.pagosProveedores),
      nominas: roundTwo(buckets.nominas),
      impuestos: roundTwo(buckets.impuestos),
      otrosIngresos: roundTwo(buckets.otrosIngresos),
      otrosGastos: roundTwo(buckets.otrosGastos),
      inversionesNetas: roundTwo(buckets.inversionesNetas),
      financiacionNeta: roundTwo(buckets.financiacionNeta),
      movimientosInternos: roundTwo(buckets.movimientosInternos),
      diferenciaNeta: roundTwo(diferenciaNeta),
      saldoFinal: roundTwo(saldoFinal),
      details,
    });
  }

  const totalCobros = months.reduce((s, m) => s + m.cobrosClientes + m.otrosIngresos, 0);
  const totalPagos = months.reduce(
    (s, m) => s + m.pagosProveedores + m.nominas + m.impuestos + m.otrosGastos,
    0
  );

  return {
    mode: "direct",
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    currency: "EUR",
    months,
    totals: {
      totalCobros: roundTwo(totalCobros),
      totalPagos: roundTwo(totalPagos),
      diferenciaNeta: roundTwo(runningBalance - openingBalance),
      saldoInicial: roundTwo(openingBalance),
      saldoFinal: roundTwo(runningBalance),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// EFE (indirect) mode
// ---------------------------------------------------------------------------

async function generateEFEReport(db: ScopedPrisma, from: Date, to: Date): Promise<EFEReport> {
  // 1. Get resultado antes de impuestos (A.3) from PyG
  const pyg = await generatePyG(db, from, to, "titles", false);
  const resultadoAntesImpuestos = pyg.results.resultadoAntesImpuestos;

  // 2. Fetch non-cash adjustments from classified transactions
  const nonCashTx = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
      classification: {
        cashflowType: "NON_CASH",
      },
    },
    include: {
      classification: { include: { account: true } },
    },
  });

  // 3. Get amortisation (line 8 from PyG — always a non-cash item)
  const amortLine = pyg.lines.find((l) => l.code === "8");
  const amortizacion = amortLine ? Math.abs(amortLine.amount) : 0;

  // 4. Get provision changes (line 10 from PyG)
  const provisionLine = pyg.lines.find((l) => l.code === "10");
  const provisiones = provisionLine ? provisionLine.amount : 0;

  // 5. Working capital changes — compare invoices pending at start vs end
  const [pendingStart, pendingEnd] = await Promise.all([
    getWorkingCapitalSnapshot(db, from),
    getWorkingCapitalSnapshot(db, to),
  ]);

  const wcDeudores = -(pendingEnd.deudores - pendingStart.deudores);
  const wcAcreedores = pendingEnd.acreedores - pendingStart.acreedores;
  const wcChange = wcDeudores + wcAcreedores;

  // Other non-cash adjustments
  const otherNonCash = nonCashTx.reduce((s, tx) => s + tx.amount, 0);

  const flujosExplotacion =
    resultadoAntesImpuestos + amortizacion + provisiones + wcChange + otherNonCash;

  // 6. Investment flows
  const investingTx = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
      classification: { cashflowType: "INVESTING" },
    },
  });
  const flujosInversion = investingTx.reduce((s, tx) => s + tx.amount, 0);

  // 7. Financing flows
  const financingTx = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
      classification: { cashflowType: "FINANCING" },
    },
  });
  const flujosFinanciacion = financingTx.reduce((s, tx) => s + tx.amount, 0);

  // 8. Cash position
  const lastTxBefore = await db.bankTransaction.findFirst({
    where: {
      valueDate: { lt: from },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });

  const efectivoInicio = lastTxBefore?.balanceAfter ?? 0;
  const aumentoDisminucion = flujosExplotacion + flujosInversion + flujosFinanciacion;
  const efectivoFinal = efectivoInicio + aumentoDisminucion;

  const sections: EFESection[] = [
    {
      code: "A",
      label: "Flujos de efectivo de las actividades de explotación",
      amount: roundTwo(flujosExplotacion),
      children: [
        {
          label: "Resultado antes de impuestos",
          amount: roundTwo(resultadoAntesImpuestos),
        },
        {
          label: "Ajuste: Amortización del inmovilizado",
          amount: roundTwo(amortizacion),
        },
        {
          label: "Ajuste: Variación de provisiones",
          amount: roundTwo(provisiones),
        },
        {
          label: "Cambios en capital circulante — deudores",
          amount: roundTwo(wcDeudores),
        },
        {
          label: "Cambios en capital circulante — acreedores",
          amount: roundTwo(wcAcreedores),
        },
        {
          label: "Otros ajustes no monetarios",
          amount: roundTwo(otherNonCash),
        },
      ],
    },
    {
      code: "B",
      label: "Flujos de efectivo de las actividades de inversión",
      amount: roundTwo(flujosInversion),
    },
    {
      code: "C",
      label: "Flujos de efectivo de las actividades de financiación",
      amount: roundTwo(flujosFinanciacion),
    },
    {
      code: "D",
      label: "Aumento/disminución neta del efectivo",
      amount: roundTwo(aumentoDisminucion),
    },
    {
      code: "E",
      label: "Efectivo al inicio del periodo",
      amount: roundTwo(efectivoInicio),
    },
    {
      code: "F",
      label: "Efectivo al final del periodo",
      amount: roundTwo(efectivoFinal),
    },
  ];

  return {
    mode: "indirect",
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    currency: "EUR",
    sections,
    totals: {
      flujosExplotacion: roundTwo(flujosExplotacion),
      flujosInversion: roundTwo(flujosInversion),
      flujosFinanciacion: roundTwo(flujosFinanciacion),
      aumentoDisminucionEfectivo: roundTwo(aumentoDisminucion),
      efectivoInicio: roundTwo(efectivoInicio),
      efectivoFinal: roundTwo(efectivoFinal),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Working capital helpers
// ---------------------------------------------------------------------------

interface WorkingCapitalSnapshot {
  /** Total pending amounts from issued invoices (receivables) */
  deudores: number;
  /** Total pending amounts from received invoices (payables) */
  acreedores: number;
}

async function getWorkingCapitalSnapshot(
  db: ScopedPrisma,
  asOf: Date
): Promise<WorkingCapitalSnapshot> {
  // Issued invoices not fully paid by asOf date
  const issuedPending = await db.invoice.aggregate({
    where: {
      type: { in: ["ISSUED", "CREDIT_ISSUED"] },
      issueDate: { lte: asOf },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    _sum: { amountPending: true },
  });

  // Received invoices not fully paid by asOf date
  const receivedPending = await db.invoice.aggregate({
    where: {
      type: { in: ["RECEIVED", "CREDIT_RECEIVED"] },
      issueDate: { lte: asOf },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    _sum: { amountPending: true },
  });

  return {
    deudores: issuedPending._sum.amountPending ?? 0,
    acreedores: Math.abs(receivedPending._sum.amountPending ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateCashflow(
  db: ScopedPrisma,
  from: Date,
  to: Date,
  mode: CashflowMode = "direct"
): Promise<CashflowReport> {
  if (mode === "indirect") {
    return generateEFEReport(db, from, to);
  }
  return generateTreasuryReport(db, from, to);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
