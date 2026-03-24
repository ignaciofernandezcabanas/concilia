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
// EFE (PGC indirect method) — Estado de Flujos de Efectivo
// ---------------------------------------------------------------------------

async function generateEFEReport(db: ScopedPrisma, from: Date, to: Date): Promise<EFEReport> {
  // ── A.1: Resultado antes de impuestos (from PyG) ──
  const pyg = await generatePyG(db, from, to, "titles", false);
  const A1 = pyg.results.resultadoAntesImpuestos;

  // ── A.2: Ajustes del resultado (non-cash items from PyG) ──
  const amortLine = pyg.lines.find((l) => l.code === "8");
  const A2a = amortLine ? Math.abs(amortLine.amount) : 0; // Amortización (+)

  // Financial results from PyG (need to reverse them for indirect method)
  const financialIncomeLine = pyg.lines.find((l) => l.code === "12");
  const financialExpenseLine = pyg.lines.find((l) => l.code === "13");
  const A2g = financialIncomeLine ? -Math.abs(financialIncomeLine.amount) : 0; // Ingresos financieros (-)
  const A2h = financialExpenseLine ? Math.abs(financialExpenseLine.amount) : 0; // Gastos financieros (+)

  const A2total = A2a + A2g + A2h;

  // ── A.3: Cambios en capital corriente ──
  const [wcStart, wcEnd] = await Promise.all([
    getWorkingCapitalSnapshot(db, from),
    getWorkingCapitalSnapshot(db, to),
  ]);
  const A3b = -(wcEnd.deudores - wcStart.deudores); // Δ Deudores (+ if decreased)
  const A3d = wcEnd.acreedores - wcStart.acreedores; // Δ Acreedores (+ if increased)
  const A3total = A3b + A3d;

  // ── A.4: Otros flujos de explotación (cash items from bank) ──
  const allTxs = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    include: {
      classification: true,
      reconciliations: {
        include: { invoice: { select: { type: true, number: true } } },
        take: 1,
      },
    },
    orderBy: { valueDate: "asc" },
  });

  const txDetail = (tx: any): EFETransactionDetail => ({
    id: tx.id,
    date: tx.valueDate.toISOString().slice(0, 10),
    concept: tx.concept ?? "",
    counterpartName: tx.counterpartName ?? null,
    amount: tx.amount,
    invoiceNumber: tx.reconciliations?.[0]?.invoice?.number ?? undefined,
  });

  // Classify bank transactions for A.4, B, C sections
  const concept = (tx: any) => (tx.concept ?? "").toUpperCase();

  const interestPaid: EFETransactionDetail[] = [];
  const dividendsReceived: EFETransactionDetail[] = [];
  const interestReceived: EFETransactionDetail[] = [];
  const taxPaid: EFETransactionDetail[] = [];
  const investCapex: EFETransactionDetail[] = [];
  const investDisposal: EFETransactionDetail[] = [];
  const investFinancial: EFETransactionDetail[] = [];
  const financingIn: EFETransactionDetail[] = [];
  const financingOut: EFETransactionDetail[] = [];
  const internal: EFETransactionDetail[] = [];

  for (const tx of allTxs) {
    const c = concept(tx);
    const ec = tx.economicCategory;
    const cft = tx.classification?.cashflowType;

    // Internal transfers — exclude from all sections
    if (cft === "INTERNAL" || /TRASPASO\s*(ENTRE\s*)?CUENTAS|TRANSFERENCIA\s*INTERNA/.test(c)) {
      internal.push(txDetail(tx));
      continue;
    }

    // Investment flows (B)
    if (ec === "CAPEX_ACQUISITION" || (cft === "INVESTING" && tx.amount < 0)) {
      investCapex.push(txDetail(tx));
      continue;
    }
    if (ec === "CAPEX_DISPOSAL" || (cft === "INVESTING" && tx.amount > 0)) {
      investDisposal.push(txDetail(tx));
      continue;
    }
    if (
      [
        "INVESTMENT_ACQUISITION",
        "INVESTMENT_DIVESTMENT",
        "INVESTMENT_RETURN",
        "LOAN_GRANTED",
        "LOAN_REPAYMENT_RECEIVED",
      ].includes(ec ?? "")
    ) {
      investFinancial.push(txDetail(tx));
      continue;
    }

    // Financing flows (C)
    if (ec === "FINANCING_IN" || (cft === "FINANCING" && tx.amount > 0)) {
      financingIn.push(txDetail(tx));
      continue;
    }
    if (ec === "FINANCING_OUT" || (cft === "FINANCING" && tx.amount < 0)) {
      financingOut.push(txDetail(tx));
      continue;
    }
    if (/PRESTAMO|PRÉSTAMO|CUOTA.*ICO|HIPOTECA|AMORTIZACION\s*DEUDA/.test(c)) {
      (tx.amount > 0 ? financingIn : financingOut).push(txDetail(tx));
      continue;
    }

    // A.4: Operating cash items
    if (/INTERES.*PAGA|PAGO.*INTERES|COMISION.*PREST/.test(c) || (ec === "TAX_PAYMENT" && false)) {
      interestPaid.push(txDetail(tx));
      continue;
    }
    if (/DIVIDENDO.*COBR|COBRO.*DIVIDENDO|REPARTO.*BENEFICIO/.test(c) && tx.amount > 0) {
      dividendsReceived.push(txDetail(tx));
      continue;
    }
    if (/INTERES.*COBR|COBRO.*INTERES/.test(c) && tx.amount > 0) {
      interestReceived.push(txDetail(tx));
      continue;
    }
    if (
      /AEAT|HACIENDA|AGENCIA\s*TRIBUTARIA|MODELO\s*\d|IVA\s*\d|IRPF/.test(c) ||
      ec === "TAX_PAYMENT"
    ) {
      taxPaid.push(txDetail(tx));
      continue;
    }

    // Everything else is operating (already captured in A.1-A.3 via PyG + WC)
    // No need to add to any bucket — the indirect method already accounts for it
  }

  const sum = (arr: EFETransactionDetail[]) => roundTwo(arr.reduce((s, t) => s + t.amount, 0));

  const A4a = sum(interestPaid);
  const A4b = sum(dividendsReceived);
  const A4c = sum(interestReceived);
  const A4d = sum(taxPaid);
  const A4total = A4a + A4b + A4c + A4d;

  const A5 = roundTwo(A1 + A2total + A3total + A4total);

  // ── B: Investment flows ──
  const B6 = sum(investCapex) + sum(investFinancial.filter((t) => t.amount < 0));
  const B7 = sum(investDisposal) + sum(investFinancial.filter((t) => t.amount > 0));
  const B8 = roundTwo(B6 + B7);

  // ── C: Financing flows ──
  const C10a = sum(financingIn);
  const C10c = sum(financingOut);
  const C12 = roundTwo(C10a + C10c);

  // ── D: FX effect ──
  const D = 0;

  // ── E, F1, F2: Cash positions ──
  const lastTxBefore = await db.bankTransaction.findFirst({
    where: {
      valueDate: { lt: from },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });
  const F1 = lastTxBefore?.balanceAfter ?? 0;

  const lastTxEnd = await db.bankTransaction.findFirst({
    where: {
      valueDate: { lte: to },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });
  const F2 = lastTxEnd?.balanceAfter ?? 0;
  const E = roundTwo(F2 - F1);

  // Consistency check
  const theoretical = roundTwo(A5 + B8 + C12 + D);
  if (Math.abs(theoretical - E) > 1) {
    console.warn(
      `[efe] Consistency gap: theoretical=${theoretical}, actual=${E}, gap=${roundTwo(theoretical - E)}`
    );
  }

  const line = (label: string, amount: number, txs?: EFETransactionDetail[]): EFELine => ({
    label,
    amount: roundTwo(amount),
    transactions: txs && txs.length > 0 ? txs : undefined,
  });

  // ── Build full PGC structure ──
  const sections: EFESection[] = [
    {
      code: "A",
      label: "A) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE EXPLOTACIÓN",
      amount: A5,
      children: [
        line("1. Resultado del ejercicio antes de impuestos", A1),
        line("2. Ajustes del resultado", A2total),
        line("  a) Amortización del inmovilizado (+) (680, 681, 682)", A2a),
        line("  b) Correcciones valorativas por deterioro (+/–) (690-699, 790-799)", 0),
        line("  c) Variación de provisiones (+/–) (14*)", 0),
        line("  d) Imputación de subvenciones (–) (746)", 0),
        line(
          "  e) Resultados por bajas y enajenaciones del inmovilizado (+/–) (670-672, 770-772)",
          0
        ),
        line("  f) Resultados por bajas de instrumentos financieros (+/–) (666, 667, 766)", 0),
        line("  g) Ingresos financieros (–) (760, 761, 762, 769)", A2g),
        line("  h) Gastos financieros (+) (661, 662, 664, 665, 669)", A2h),
        line("  i) Diferencias de cambio (+/–) (668, 768)", 0),
        line("  j) Variación de valor razonable en instrumentos financieros (+/–) (663, 763)", 0),
        line("  k) Otros ingresos y gastos (–/+)", 0),
        line("3. Cambios en el capital corriente", A3total),
        line("  a) Existencias (+/–) (30*-39*)", 0),
        line("  b) Deudores y otras cuentas a cobrar (+/–) (43*, 44*)", A3b),
        line("  c) Otros activos corrientes (+/–) (48*)", 0),
        line("  d) Acreedores y otras cuentas a pagar (+/–) (40*, 41*)", A3d),
        line("  e) Otros pasivos corrientes (+/–) (485, 568)", 0),
        line("4. Otros flujos de efectivo de explotación", A4total),
        line("  a) Pagos de intereses (–)", A4a, interestPaid),
        line("  b) Cobros de dividendos (+)", A4b, dividendsReceived),
        line("  c) Cobros de intereses (+)", A4c, interestReceived),
        line("  d) Cobros (pagos) por impuesto sobre beneficios", A4d, taxPaid),
        line("5. Flujos de efectivo de las actividades de explotación (1+2+3+4)", A5),
      ],
    },
    {
      code: "B",
      label: "B) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE INVERSIÓN",
      amount: B8,
      children: [
        line("6. Pagos por inversiones (–)", B6),
        line(
          "  a) Empresas del grupo y asociadas (24*)",
          sum(investFinancial.filter((t) => t.amount < 0)),
          investFinancial.filter((t) => t.amount < 0)
        ),
        line("  b) Inmovilizado intangible (20*)", 0),
        line("  c) Inmovilizado material (21*)", sum(investCapex), investCapex),
        line("  d) Inversiones inmobiliarias (22*)", 0),
        line("  e) Otros activos financieros (25*)", 0),
        line("7. Cobros por desinversiones (+)", B7),
        line(
          "  a) Empresas del grupo y asociadas",
          sum(investFinancial.filter((t) => t.amount > 0)),
          investFinancial.filter((t) => t.amount > 0)
        ),
        line("  b) Inmovilizado intangible", 0),
        line("  c) Inmovilizado material", sum(investDisposal), investDisposal),
        line("  d) Inversiones inmobiliarias", 0),
        line("  e) Otros activos financieros", 0),
        line("8. Flujos de efectivo de las actividades de inversión (6+7)", B8),
      ],
    },
    {
      code: "C",
      label: "C) FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE FINANCIACIÓN",
      amount: C12,
      children: [
        line("9. Cobros y pagos por instrumentos de patrimonio", 0),
        line("  a) Emisión de instrumentos de patrimonio (10*)", 0),
        line("  b) Amortización de instrumentos de patrimonio", 0),
        line("  c) Subvenciones, donaciones y legados recibidos (13*)", 0),
        line("10. Cobros y pagos por instrumentos de pasivo financiero", roundTwo(C10a + C10c)),
        line("  a) Emisión deudas con entidades de crédito (+) (170, 520)", C10a, financingIn),
        line("  b) Emisión de otras deudas (+) (171, 173, 521, 523)", 0),
        line("  c) Devolución deudas con entidades de crédito (–)", C10c, financingOut),
        line("  d) Devolución de otras deudas (–)", 0),
        line("11. Pagos por dividendos y remuneraciones de otros instrumentos de patrimonio", 0),
        line("  a) Dividendos (526, 557)", 0),
        line("12. Flujos de efectivo de las actividades de financiación (9+10+11)", C12),
      ],
    },
    { code: "D", label: "D) Efecto de las variaciones de los tipos de cambio", amount: D },
    { code: "E", label: "E) AUMENTO/DISMINUCIÓN NETA DEL EFECTIVO (A.5+B.8+C.12+D)", amount: E },
    {
      code: "F1",
      label: "F) Efectivo o equivalentes al comienzo del ejercicio (57*)",
      amount: roundTwo(F1),
    },
    {
      code: "F2",
      label: "Efectivo o equivalentes al final del ejercicio (F1+E)",
      amount: roundTwo(F2),
    },
  ];

  return {
    mode: "indirect",
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    currency: "EUR",
    sections,
    totals: {
      flujosExplotacion: A5,
      flujosInversion: B8,
      flujosFinanciacion: C12,
      aumentoDisminucionEfectivo: E,
      efectivoInicio: roundTwo(F1),
      efectivoFinal: roundTwo(F2),
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
