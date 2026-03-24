/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Withholding Reconciliation — compares withholdings from received invoices
 * against actual bank payments to AEAT for Modelo 111 (IRPF) and 115 (rent).
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface WithholdingReconciliationReport {
  quarter: number;
  year: number;
  modelo: "111" | "115";
  theoreticalWithholding: number;
  invoiceCount: number;
  bankPayments: Array<{ txId: string; date: string; amount: number; concept: string }>;
  totalPaid: number;
  discrepancy: number;
  discrepancyType: "NONE" | "AMOUNT_MISMATCH" | "MISSING_PAYMENT";
  details: string;
}

/**
 * Returns the date range for a quarter.
 */
function quarterDateRange(quarter: number, year: number): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  return { from, to };
}

/**
 * Returns the payment window: 1st-20th of the month after quarter end.
 */
function paymentWindow(quarter: number, year: number): { from: Date; to: Date } {
  const paymentMonth = quarter * 3;
  const paymentYear = quarter === 4 ? year + 1 : year;
  const realMonth = quarter === 4 ? 0 : paymentMonth;
  return {
    from: new Date(paymentYear, realMonth, 1),
    to: new Date(paymentYear, realMonth, 20, 23, 59, 59, 999),
  };
}

function isAeatModeloPayment(
  tx: { concept?: string | null; counterpartName?: string | null },
  modelo: "111" | "115"
): boolean {
  const concept = (tx.concept ?? "").toUpperCase();
  const counterpart = (tx.counterpartName ?? "").toUpperCase();
  const hasAeat =
    concept.includes("AEAT") ||
    concept.includes("AGENCIA TRIBUTARIA") ||
    counterpart.includes("HACIENDA") ||
    counterpart.includes("AGENCIA TRIBUTARIA");
  const hasModelo = concept.includes(modelo);
  return hasAeat && hasModelo;
}

export async function generateWithholdingReconciliation(
  db: ScopedPrisma,
  quarter: number,
  year: number,
  modelo: "111" | "115"
): Promise<WithholdingReconciliationReport> {
  // 1. Sum withholdings from received invoices in the quarter
  const { from, to } = quarterDateRange(quarter, year);
  const invoices = await db.invoice.findMany({
    where: {
      type: "RECEIVED",
      issueDate: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      totalAmount: true,
      netAmount: true,
      vatAmount: true,
    },
  });

  // Estimate withholdings: totalAmount - vatAmount - netAmount
  // Modelo 111 = professional services IRPF, Modelo 115 = rent
  // Both are reflected in the withholding amount deducted from invoice payment
  let theoreticalWithholding = 0;
  let invoiceCount = 0;

  for (const inv of invoices) {
    const netAmt = inv.netAmount ?? 0;
    const vatAmt = inv.vatAmount ?? 0;
    const estimatedWithholding = netAmt > 0 ? Math.max(0, inv.totalAmount - vatAmt - netAmt) : 0;
    if (estimatedWithholding > 0.01) {
      theoreticalWithholding += estimatedWithholding;
      invoiceCount++;
    }
  }
  theoreticalWithholding = r2(theoreticalWithholding);

  // 2. Find bank payments to AEAT matching the modelo in the payment window
  const window = paymentWindow(quarter, year);
  const allTxs = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: window.from, lte: window.to },
      amount: { lt: 0 },
    },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      concept: true,
      counterpartName: true,
    },
  });

  const matchedTxs = allTxs.filter((tx) => isAeatModeloPayment(tx, modelo));

  const bankPayments = matchedTxs.map((tx) => ({
    txId: tx.id,
    date: tx.valueDate.toISOString().slice(0, 10),
    amount: r2(Math.abs(tx.amount)),
    concept: tx.concept ?? "",
  }));

  const totalPaid = r2(bankPayments.reduce((s, p) => s + p.amount, 0));

  // 3. Compare and classify discrepancy
  const discrepancy = r2(theoreticalWithholding - totalPaid);

  let discrepancyType: WithholdingReconciliationReport["discrepancyType"];
  let details: string;

  if (theoreticalWithholding === 0 && totalPaid === 0) {
    discrepancyType = "NONE";
    details = `Sin retenciones ni pagos detectados para Modelo ${modelo} en T${quarter} ${year}.`;
  } else if (totalPaid === 0 && theoreticalWithholding > 0) {
    discrepancyType = "MISSING_PAYMENT";
    details = `Retenciones teóricas de ${theoreticalWithholding}€ (${invoiceCount} facturas) sin pago bancario a AEAT (Modelo ${modelo}).`;
  } else if (Math.abs(discrepancy) < 1) {
    discrepancyType = "NONE";
    details = `Pago coincide con retenciones teóricas (diferencia: ${r2(discrepancy)}€). Modelo ${modelo}.`;
  } else {
    discrepancyType = "AMOUNT_MISMATCH";
    details = `Diferencia de ${r2(discrepancy)}€ entre retenciones teóricas (${theoreticalWithholding}€) y pago bancario (${totalPaid}€). Modelo ${modelo}.`;
  }

  return {
    quarter,
    year,
    modelo,
    theoreticalWithholding,
    invoiceCount,
    bankPayments,
    totalPaid,
    discrepancy,
    discrepancyType,
    details,
  };
}
