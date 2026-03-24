/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Working Capital Bridge Report.
 *
 * Traces the path from Net Income → EBITDA → Operating Cashflow → Free Cashflow
 * → Net Cash Change, then reconciles with the actual bank balance change.
 *
 * Steps:
 *  1. Net Income (from PyG A.4)
 *  2. Add back depreciation & provisions → EBITDA
 *  3. Working capital changes (delta AR, delta AP) → Operating CF
 *  4. CAPEX → Free CF
 *  5. Financing → Net Cash Change
 *  6. Compare to actual bank balance change → Reconciliation gap
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { generatePyG } from "./pyg-generator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WCBridgeStep {
  code: string;
  label: string;
  amount: number;
  isSubtotal: boolean;
}

export interface WCBridgeReport {
  from: string;
  to: string;
  currency: string;
  steps: WCBridgeStep[];
  netIncome: number;
  ebitda: number;
  operatingCashflow: number;
  freeCashflow: number;
  netCashChange: number;
  bankChangeActual: number;
  reconciliationGap: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateWCBridge(
  db: ScopedPrisma,
  from: Date,
  to: Date
): Promise<WCBridgeReport> {
  // 1. Get PyG to extract net income, depreciation, provisions
  const pyg = await generatePyG(db, from, to, "titles", true);

  const netIncome = pyg.results.resultadoEjercicio;

  // Line 8 = Amortización (negative expense, add back)
  const depreciation = Math.abs(pyg.lines.find((l) => l.code === "8")?.amount ?? 0);

  // Line 9 = Provisiones (add back)
  const provisions = Math.abs(pyg.lines.find((l) => l.code === "9")?.amount ?? 0);

  const ebitda = roundTwo(netIncome + depreciation + provisions);

  // 2. Working capital changes — delta in receivables and payables
  const deltaReceivables = await getAccountBalanceDelta(db, from, to, "430", "436");
  const deltaPayables = await getAccountBalanceDelta(db, from, to, "400", "406");

  // Operating CF = EBITDA - increase in AR + increase in AP
  // deltaReceivables is (debit - credit), positive means AR grew → reduces cash
  // deltaPayables is (debit - credit), for liabilities: negative means AP grew (credit > debit)
  // AP increase is a source of cash, so we subtract deltaPayables (which is negative → adds)
  const operatingCashflow = roundTwo(ebitda - deltaReceivables - deltaPayables);

  // 3. CAPEX from bank transactions
  const capexTx = await (db as any).bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      economicCategory: "CAPEX_ACQUISITION",
    },
  });
  const capex = roundTwo(
    capexTx.reduce((sum: number, tx: { amount: number }) => sum + Math.abs(tx.amount), 0)
  );

  const freeCashflow = roundTwo(operatingCashflow - capex);

  // 4. Financing from bank transactions
  const financingTx = await (db as any).bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      economicCategory: { in: ["FINANCING_IN", "FINANCING_OUT"] },
    },
  });
  const financing = roundTwo(
    financingTx.reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0)
  );

  const netCashChange = roundTwo(freeCashflow + financing);

  // 5. Actual bank balance change
  const bankChangeActual = await getBankBalanceChange(db, from, to);

  // 6. Reconciliation gap
  const reconciliationGap = roundTwo(netCashChange - bankChangeActual);

  // Build steps array
  const steps: WCBridgeStep[] = [
    {
      code: "NET_INCOME",
      label: "Resultado del ejercicio (A.4)",
      amount: netIncome,
      isSubtotal: false,
    },
    {
      code: "DEPRECIATION",
      label: "Amortización del inmovilizado",
      amount: depreciation,
      isSubtotal: false,
    },
    {
      code: "PROVISIONS",
      label: "Provisiones",
      amount: provisions,
      isSubtotal: false,
    },
    {
      code: "EBITDA",
      label: "EBITDA",
      amount: ebitda,
      isSubtotal: true,
    },
    {
      code: "DELTA_AR",
      label: "Variación cuentas a cobrar (430-436)",
      amount: -deltaReceivables,
      isSubtotal: false,
    },
    {
      code: "DELTA_AP",
      label: "Variación cuentas a pagar (400-406)",
      amount: -deltaPayables,
      isSubtotal: false,
    },
    {
      code: "OPERATING_CF",
      label: "Flujo de caja operativo",
      amount: operatingCashflow,
      isSubtotal: true,
    },
    {
      code: "CAPEX",
      label: "Inversiones (CAPEX)",
      amount: -capex,
      isSubtotal: false,
    },
    {
      code: "FREE_CF",
      label: "Flujo de caja libre",
      amount: freeCashflow,
      isSubtotal: true,
    },
    {
      code: "FINANCING",
      label: "Financiación",
      amount: financing,
      isSubtotal: false,
    },
    {
      code: "NET_CASH_CHANGE",
      label: "Variación neta de caja",
      amount: netCashChange,
      isSubtotal: true,
    },
    {
      code: "BANK_ACTUAL",
      label: "Variación real saldo bancario",
      amount: bankChangeActual,
      isSubtotal: false,
    },
    {
      code: "GAP",
      label: "Diferencia de conciliación",
      amount: reconciliationGap,
      isSubtotal: true,
    },
  ];

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    currency: "EUR",
    steps,
    netIncome,
    ebitda,
    operatingCashflow,
    freeCashflow,
    netCashChange,
    bankChangeActual,
    reconciliationGap,
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
 * Calculate the net movement (debit - credit) for accounts in a code range
 * during the given period, from POSTED journal entries.
 * A positive result means debit > credit (e.g., AR grew).
 */
async function getAccountBalanceDelta(
  db: ScopedPrisma,
  from: Date,
  to: Date,
  codeFrom: string,
  codeTo: string
): Promise<number> {
  // Find accounts in the range
  const accounts = await (db as any).account.findMany({
    where: {
      code: { gte: codeFrom, lte: codeTo },
    },
    select: { id: true },
  });

  if (accounts.length === 0) return 0;

  const accountIds = accounts.map((a: { id: string }) => a.id);

  // Sum journal entry lines for these accounts in the period
  const lines = await (db as any).journalEntryLine.findMany({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        date: { gte: from, lte: to },
        status: "POSTED",
      },
    },
    select: { debit: true, credit: true },
  });

  let total = 0;
  for (const line of lines) {
    total += (line.debit ?? 0) - (line.credit ?? 0);
  }

  return roundTwo(total);
}

/**
 * Calculate the actual bank balance change during the period.
 * Uses the last transaction's balanceAfter minus the first transaction's
 * balanceAfter before the period start.
 */
async function getBankBalanceChange(db: ScopedPrisma, from: Date, to: Date): Promise<number> {
  // Last transaction in the period
  const lastTx = await (db as any).bankTransaction.findFirst({
    where: { valueDate: { lte: to } },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });

  // Last transaction before the period
  const beforeTx = await (db as any).bankTransaction.findFirst({
    where: { valueDate: { lt: from } },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });

  const endBalance = lastTx?.balanceAfter ?? 0;
  const startBalance = beforeTx?.balanceAfter ?? 0;

  return roundTwo(endBalance - startBalance);
}
