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
  generatedAt: string;
}

export async function generateBalance(
  db: ScopedPrisma,
  asOf: Date
): Promise<BalanceReport> {
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
    { code: "TOTAL_PNP", amount: roundTwo(totalPasivo) },
  );

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
    generatedAt: new Date().toISOString(),
  };
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
