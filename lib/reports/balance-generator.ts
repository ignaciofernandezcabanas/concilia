/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Balance de Situación generator.
 *
 * Derives balance sheet from:
 * - Invoices (deudores/acreedores)
 * - Bank transactions (efectivo)
 * - Classified transactions (by PGC account group)
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

export interface BalanceLineData {
  code: string;
  amount: number;
}

export interface PatrimonioNetoBreakdown {
  capital: number; // 100
  primaEmision: number; // 110
  reservaLegal: number; // 112
  reservasVoluntarias: number; // 113
  otrasReservas: number; // 114, 119
  resultadosEjAnteriores: number; // 120, 121
  resultadoEjercicio: number; // 129
  subvenciones: number; // 130, 131
  total: number;
  capitalAdequacy: { ratio: number; alert: string | null };
}

export interface BalanceReport {
  asOf: string;
  currency: string;
  lines: BalanceLineData[];
  totals: {
    activoNoCorriente: number;
    activoCorriente: number;
    totalActivo: number;
    patrimonioNeto: number;
    pasivoNoCorriente: number;
    pasivoCorriente: number;
    totalPasivo: number;
  };
  patrimonioNetoDetail: PatrimonioNetoBreakdown;
  generatedAt: string;
}

export async function generateBalance(db: ScopedPrisma, asOf: Date): Promise<BalanceReport> {
  // ── Deudores comerciales: facturas emitidas pendientes ──
  const deudores = await db.invoice.aggregate({
    where: {
      type: { in: ["ISSUED", "CREDIT_RECEIVED"] },
      issueDate: { lte: asOf },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    _sum: { amountPending: true },
  });
  const deudoresTotal = deudores._sum.amountPending ?? 0;

  // ── Acreedores comerciales: facturas recibidas pendientes ──
  const acreedores = await db.invoice.aggregate({
    where: {
      type: { in: ["RECEIVED", "CREDIT_ISSUED"] },
      issueDate: { lte: asOf },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    _sum: { amountPending: true },
  });
  const acreedoresTotal = Math.abs(acreedores._sum.amountPending ?? 0);

  // ── Efectivo: último saldo bancario conocido ──
  const lastTx = await db.bankTransaction.findFirst({
    where: {
      valueDate: { lte: asOf },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });
  const efectivo = lastTx?.balanceAfter ?? 0;

  // ── Result of the period (from PyG): ingresos - gastos ──
  const invoiceIncome = await db.invoice.aggregate({
    where: {
      type: { in: ["ISSUED", "CREDIT_RECEIVED"] },
      issueDate: { lte: asOf },
      status: { notIn: ["CANCELLED"] },
    },
    _sum: { totalAmount: true },
  });
  const invoiceExpense = await db.invoice.aggregate({
    where: {
      type: { in: ["RECEIVED", "CREDIT_ISSUED"] },
      issueDate: { lte: asOf },
      status: { notIn: ["CANCELLED"] },
    },
    _sum: { totalAmount: true },
  });
  const resultadoEjercicio =
    (invoiceIncome._sum.totalAmount ?? 0) - (invoiceExpense._sum.totalAmount ?? 0);

  // Build line amounts
  const lines: BalanceLineData[] = [
    // Activo
    { code: "AC.II.1", amount: roundTwo(deudoresTotal) },
    { code: "AC.VI", amount: roundTwo(efectivo) },
    // Patrimonio neto
    { code: "PN.1.VII", amount: roundTwo(resultadoEjercicio) },
    // Pasivo corriente
    { code: "PC.IV.1", amount: roundTwo(acreedoresTotal) },
  ];

  // Calculate totals
  const activoNoCorriente = 0;
  const activoCorriente = deudoresTotal + efectivo;
  const totalActivo = activoNoCorriente + activoCorriente;

  const patrimonioNeto = resultadoEjercicio;
  const pasivoNoCorriente = 0;
  const pasivoCorriente = acreedoresTotal;
  const totalPasivo = patrimonioNeto + pasivoNoCorriente + pasivoCorriente;

  // Aggregated codes
  lines.push(
    { code: "ANC", amount: roundTwo(activoNoCorriente) },
    { code: "AC", amount: roundTwo(activoCorriente) },
    { code: "AC.II", amount: roundTwo(deudoresTotal) },
    { code: "TOTAL_ACTIVO", amount: roundTwo(totalActivo) },
    { code: "PN", amount: roundTwo(patrimonioNeto) },
    { code: "PN.1", amount: roundTwo(patrimonioNeto) },
    { code: "PNC", amount: roundTwo(pasivoNoCorriente) },
    { code: "PC", amount: roundTwo(pasivoCorriente) },
    { code: "PC.IV", amount: roundTwo(acreedoresTotal) },
    { code: "TOTAL_PNP", amount: roundTwo(totalPasivo) }
  );

  // ── Patrimonio Neto detail from journal entries ──
  const patrimonioNetoDetail = await computePatrimonioNetoDetail(db);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    currency: "EUR",
    lines,
    totals: {
      activoNoCorriente: roundTwo(activoNoCorriente),
      activoCorriente: roundTwo(activoCorriente),
      totalActivo: roundTwo(totalActivo),
      patrimonioNeto: roundTwo(patrimonioNeto),
      pasivoNoCorriente: roundTwo(pasivoNoCorriente),
      pasivoCorriente: roundTwo(pasivoCorriente),
      totalPasivo: roundTwo(totalPasivo),
    },
    patrimonioNetoDetail,
    generatedAt: new Date().toISOString(),
  };
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Patrimonio Neto breakdown
// ---------------------------------------------------------------------------

async function getAccountBalanceFromJE(db: ScopedPrisma, code: string): Promise<number> {
  const account = await db.account.findFirst({
    where: { code },
    select: { id: true },
  });
  if (!account) return 0;

  const lines = await (db as any).journalEntryLine.findMany({
    where: { accountId: account.id },
    select: { debit: true, credit: true },
  });

  let balance = 0;
  for (const line of lines) {
    balance += (line.debit ?? 0) - (line.credit ?? 0);
  }
  return balance;
}

/**
 * Computes a detailed breakdown of Patrimonio Neto from PGC equity accounts.
 *
 * Equity accounts have credit-normal balance, so in our debit-minus-credit
 * convention a credit balance appears as negative. We negate to get the
 * positive PN contribution for each item.
 */
async function computePatrimonioNetoDetail(db: ScopedPrisma): Promise<PatrimonioNetoBreakdown> {
  // Helper: for passive/equity accounts, credit balance = negative in D-C → negate
  const eq = async (code: string) => -(await getAccountBalanceFromJE(db, code));

  const capital = await eq("100");
  const primaEmision = await eq("110");
  const reservaLegal = await eq("112");
  const reservasVoluntarias = await eq("113");
  const otrasReservas114 = await eq("114");
  const otrasReservas119 = await eq("119");
  const otrasReservas = otrasReservas114 + otrasReservas119;
  // 120 = remanente (credit normal → positive); 121 = pérdidas anteriores (debit normal → negative PN)
  const remanente120 = await eq("120");
  const perdidas121 = await eq("121");
  const resultadosEjAnteriores = remanente120 + perdidas121;
  const resultadoEjercicio = await eq("129");
  const subv130 = await eq("130");
  const subv131 = await eq("131");
  const subvenciones = subv130 + subv131;

  const total =
    capital +
    primaEmision +
    reservaLegal +
    reservasVoluntarias +
    otrasReservas +
    resultadosEjAnteriores +
    resultadoEjercicio +
    subvenciones;

  const ratio = capital > 0 ? total / capital : 0;
  let alert: string | null = null;
  if (capital > 0) {
    if (ratio <= 0.5) {
      alert = "CRITICAL";
    } else if (ratio <= 1.0) {
      alert = "WARNING";
    }
  }

  return {
    capital: roundTwo(capital),
    primaEmision: roundTwo(primaEmision),
    reservaLegal: roundTwo(reservaLegal),
    reservasVoluntarias: roundTwo(reservasVoluntarias),
    otrasReservas: roundTwo(otrasReservas),
    resultadosEjAnteriores: roundTwo(resultadosEjAnteriores),
    resultadoEjercicio: roundTwo(resultadoEjercicio),
    subvenciones: roundTwo(subvenciones),
    total: roundTwo(total),
    capitalAdequacy: { ratio: roundTwo(ratio), alert },
  };
}
