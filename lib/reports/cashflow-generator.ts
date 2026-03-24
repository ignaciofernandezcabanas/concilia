/* eslint-disable @typescript-eslint/no-explicit-any */
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

/** EFE mode types */

export interface EFETransactionDetail {
  id: string;
  date: string;
  concept: string;
  counterpartName: string | null;
  amount: number;
  invoiceNumber?: string;
}

export interface EFELine {
  label: string;
  amount: number;
  transactions?: EFETransactionDetail[];
}

export interface EFESection {
  code: string;
  label: string;
  amount: number;
  children?: EFELine[];
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

// ---------------------------------------------------------------------------
// EFE classification cascade for individual transactions
// ---------------------------------------------------------------------------

type EFEBucket =
  | "cobrosClientes"
  | "pagosProveedores"
  | "nominas"
  | "impuestos"
  | "otrosOperativos"
  | "investing_capex"
  | "investing_disposal"
  | "investing_financial"
  | "financing_in"
  | "financing_out"
  | "internal"
  | "excluded"; // NON_CASH

function classifyForEFE(tx: {
  amount: number;
  concept: string | null;
  economicCategory: string | null;
  classification?: { cashflowType: string | null } | null;
  reconciliations?: Array<{ invoice?: { type: string } | null }>;
}): EFEBucket {
  const concept = (tx.concept ?? "").toUpperCase();

  // 1. economicCategory (highest priority — set by detectors/resolver)
  if (tx.economicCategory) {
    const ec = tx.economicCategory;
    if (ec === "CAPEX_ACQUISITION") return "investing_capex";
    if (ec === "CAPEX_DISPOSAL") return "investing_disposal";
    if (
      ec === "INVESTMENT_ACQUISITION" ||
      ec === "INVESTMENT_DIVESTMENT" ||
      ec === "INVESTMENT_RETURN" ||
      ec === "LOAN_GRANTED" ||
      ec === "LOAN_REPAYMENT_RECEIVED"
    )
      return "investing_financial";
    if (ec === "FINANCING_IN") return "financing_in";
    if (ec === "FINANCING_OUT") return "financing_out";
    if (ec === "TAX_PAYMENT") return "impuestos";
    if (ec === "INTERCOMPANY") return "internal";
  }

  // 2. classification.cashflowType (from reconciliation engine)
  const cft = tx.classification?.cashflowType;
  if (cft === "INVESTING") return "investing_financial";
  if (cft === "FINANCING") return tx.amount > 0 ? "financing_in" : "financing_out";
  if (cft === "INTERNAL") return "internal";
  if (cft === "NON_CASH") return "excluded";

  // 3. Reconciliation context — matched invoice tells us the nature
  const reco = tx.reconciliations?.[0];
  if (reco?.invoice) {
    const invType = reco.invoice.type;
    if (invType === "ISSUED" || invType === "CREDIT_RECEIVED") return "cobrosClientes";
    if (invType === "RECEIVED" || invType === "CREDIT_ISSUED") return "pagosProveedores";
  }

  // 4. Concept heuristics
  if (/NOMINA|NÓMINA|SALARIO|PAGO\s*EMPLEADOS|TGSS|SEGURIDAD\s*SOCIAL|SS\s*EMPRESA/.test(concept))
    return "nominas";
  if (/AEAT|HACIENDA|AGENCIA\s*TRIBUTARIA|MODELO\s*\d|IVA\s*\d|IRPF/.test(concept))
    return "impuestos";
  if (/PRESTAMO|PRÉSTAMO|CUOTA.*ICO|HIPOTECA|LEASING|AMORTIZACION\s*DEUDA/.test(concept))
    return tx.amount > 0 ? "financing_in" : "financing_out";
  if (/TRASPASO\s*(ENTRE\s*)?CUENTAS|TRANSFERENCIA\s*INTERNA/.test(concept)) return "internal";

  // 5. Amount sign fallback
  return tx.amount >= 0 ? "cobrosClientes" : "pagosProveedores";
}

// ---------------------------------------------------------------------------
// EFE (direct cash-basis) mode
// ---------------------------------------------------------------------------

async function generateEFEReport(db: ScopedPrisma, from: Date, to: Date): Promise<EFEReport> {
  // 1. Fetch ALL bank transactions in period
  const transactions = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    include: {
      classification: true,
      reconciliations: {
        where: { status: { in: ["APPROVED", "AUTO_APPROVED"] } },
        include: { invoice: { select: { type: true, number: true } } },
        take: 1,
      },
    },
    orderBy: { valueDate: "asc" },
  });

  // 2. Classify each transaction into EFE buckets
  type BucketKey = Exclude<EFEBucket, "excluded">;
  const buckets: Record<BucketKey, EFETransactionDetail[]> = {
    cobrosClientes: [],
    pagosProveedores: [],
    nominas: [],
    impuestos: [],
    otrosOperativos: [],
    investing_capex: [],
    investing_disposal: [],
    investing_financial: [],
    financing_in: [],
    financing_out: [],
    internal: [],
  };

  for (const tx of transactions) {
    const bucket = classifyForEFE(tx);
    if (bucket === "excluded") continue;
    buckets[bucket].push({
      id: tx.id,
      date: tx.valueDate.toISOString().slice(0, 10),
      concept: tx.concept ?? "",
      counterpartName: tx.counterpartName ?? null,
      amount: tx.amount,
      invoiceNumber: tx.reconciliations?.[0]?.invoice?.number ?? undefined,
    });
  }

  const sum = (arr: EFETransactionDetail[]) => roundTwo(arr.reduce((s, t) => s + t.amount, 0));

  // 3. Calculate section totals
  const flujosExplotacion =
    sum(buckets.cobrosClientes) +
    sum(buckets.pagosProveedores) +
    sum(buckets.nominas) +
    sum(buckets.impuestos) +
    sum(buckets.otrosOperativos);

  const flujosInversion =
    sum(buckets.investing_capex) +
    sum(buckets.investing_disposal) +
    sum(buckets.investing_financial);

  const flujosFinanciacion = sum(buckets.financing_in) + sum(buckets.financing_out);

  // 4. Cash positions
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

  const lastTxEnd = await db.bankTransaction.findFirst({
    where: {
      valueDate: { lte: to },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });
  const efectivoFinal = lastTxEnd?.balanceAfter ?? 0;
  const aumentoDisminucion = efectivoFinal - efectivoInicio;

  // 5. Build sections with drill-down transactions
  const line = (label: string, arr: EFETransactionDetail[]): EFELine => ({
    label,
    amount: sum(arr),
    transactions: arr.length > 0 ? arr : undefined,
  });

  const sections: EFESection[] = [
    {
      code: "A",
      label: "A) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE EXPLOTACIÓN",
      amount: roundTwo(flujosExplotacion),
      children: [
        line("Cobros de clientes", buckets.cobrosClientes),
        line("Pagos a proveedores", buckets.pagosProveedores),
        line("Nóminas y Seguridad Social", buckets.nominas),
        line("Impuestos pagados", buckets.impuestos),
        line("Otros cobros/pagos operativos", buckets.otrosOperativos),
      ].filter((l) => l.amount !== 0),
    },
    {
      code: "B",
      label: "B) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE INVERSIÓN",
      amount: roundTwo(flujosInversion),
      children: [
        line("Pagos por adquisición de inmovilizado", buckets.investing_capex),
        line("Cobros por enajenaciones de inmovilizado", buckets.investing_disposal),
        line("Inversiones/desinversiones financieras", buckets.investing_financial),
      ].filter((l) => l.amount !== 0),
    },
    {
      code: "C",
      label: "C) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE FINANCIACIÓN",
      amount: roundTwo(flujosFinanciacion),
      children: [
        line("Entradas de financiación", buckets.financing_in),
        line("Pagos de cuotas y préstamos", buckets.financing_out),
      ].filter((l) => l.amount !== 0),
    },
    {
      code: "D",
      label: "D) AUMENTO/DISMINUCIÓN NETA DEL EFECTIVO",
      amount: roundTwo(aumentoDisminucion),
    },
    {
      code: "E",
      label: "E) EFECTIVO AL COMIENZO DEL EJERCICIO",
      amount: roundTwo(efectivoInicio),
    },
    {
      code: "F",
      label: "F) EFECTIVO AL FINAL DEL EJERCICIO",
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

export async function getWorkingCapitalSnapshot(
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
