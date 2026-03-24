/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * VAT Reconciliation — compares theoretical VAT (from invoices) with actual
 * bank payments to AEAT (Agencia Tributaria).
 *
 * Identifies timing issues, missing payments, and amount mismatches for
 * Modelo 303 quarterly declarations.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { generateVatReport } from "@/lib/reports/vat-generator";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface VatReconciliationReport {
  quarter: number;
  year: number;
  theoretical: { repercutido: number; soportado: number; liquidacion: number };
  bankPayments: Array<{ txId: string; date: string; amount: number; concept: string }>;
  totalPaid: number;
  discrepancy: number;
  discrepancyType: "NONE" | "TIMING" | "AMOUNT_MISMATCH" | "MISSING_PAYMENT";
  details: string;
}

/**
 * Returns the date range for a quarter: Q1 → Jan 1 – Mar 31, etc.
 */
function quarterDateRange(quarter: number, year: number): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3; // 0-indexed
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999); // last day of last month
  return { from, to };
}

/**
 * Returns the payment window for AEAT: 1st-20th of the month after quarter end.
 * E.g. Q1 → April 1-20, Q2 → July 1-20, Q3 → October 1-20, Q4 → January 1-20 (next year).
 */
function paymentWindow(quarter: number, year: number): { from: Date; to: Date } {
  const paymentMonth = quarter * 3; // 0-indexed: Q1→3 (April), Q2→6 (July)...
  const paymentYear = quarter === 4 ? year + 1 : year;
  const realMonth = quarter === 4 ? 0 : paymentMonth; // Q4 → January next year
  return {
    from: new Date(paymentYear, realMonth, 1),
    to: new Date(paymentYear, realMonth, 20, 23, 59, 59, 999),
  };
}

const AEAT_PATTERNS = ["303", "AEAT", "AGENCIA TRIBUTARIA", "HACIENDA"];

function isAeatVatPayment(tx: {
  concept?: string | null;
  counterpartName?: string | null;
}): boolean {
  const concept = (tx.concept ?? "").toUpperCase();
  const counterpart = (tx.counterpartName ?? "").toUpperCase();
  return AEAT_PATTERNS.some((p) => concept.includes(p) || counterpart.includes(p));
}

export async function generateVatReconciliation(
  db: ScopedPrisma,
  quarter: number,
  year: number
): Promise<VatReconciliationReport> {
  // 1. Calculate theoretical VAT using the extracted generator
  const { from, to } = quarterDateRange(quarter, year);
  const vatReport = await generateVatReport(db, "", from, to);
  // Note: companyId="" works because db is already scoped — InvoiceLine filter uses
  // invoice.companyId which the scoped db injects. We pass empty string since
  // generateVatReport adds it alongside the scoped filter.

  const theoretical = {
    repercutido: vatReport.ivaRepercutido.totalVat,
    soportado: vatReport.ivaSoportado.totalVat,
    liquidacion: vatReport.liquidacion.amount,
  };

  // 2. Find bank transactions matching AEAT in the payment window
  const window = paymentWindow(quarter, year);
  const allTxs = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: window.from, lte: window.to },
      amount: { lt: 0 }, // payments are negative
    },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      concept: true,
      counterpartName: true,
    },
  });

  const aeatTxs = allTxs.filter(isAeatVatPayment);

  const bankPayments = aeatTxs.map((tx) => ({
    txId: tx.id,
    date: tx.valueDate.toISOString().slice(0, 10),
    amount: r2(Math.abs(tx.amount)),
    concept: tx.concept ?? "",
  }));

  const totalPaid = r2(bankPayments.reduce((s, p) => s + p.amount, 0));

  // 3. Compare and classify discrepancy
  const liquidacion = theoretical.liquidacion;
  const expectedPayment = liquidacion >= 0 ? liquidacion : 0;
  // If liquidacion < 0 (A_COMPENSAR), no payment expected
  const discrepancy = r2(expectedPayment - totalPaid);

  let discrepancyType: VatReconciliationReport["discrepancyType"];
  let details: string;

  if (liquidacion < 0) {
    // A_COMPENSAR — no payment expected
    if (totalPaid === 0) {
      discrepancyType = "NONE";
      details = `Liquidación a compensar (${r2(liquidacion)}€). No se espera pago.`;
    } else {
      discrepancyType = "AMOUNT_MISMATCH";
      details = `Liquidación a compensar (${r2(liquidacion)}€) pero se detectó pago de ${totalPaid}€.`;
    }
  } else if (totalPaid === 0 && expectedPayment > 0) {
    discrepancyType = "MISSING_PAYMENT";
    details = `Liquidación a ingresar de ${r2(expectedPayment)}€ sin pago bancario detectado.`;
  } else if (Math.abs(discrepancy) < 1) {
    discrepancyType = "NONE";
    details = `Pago coincide con liquidación teórica (diferencia: ${r2(discrepancy)}€).`;
  } else {
    discrepancyType = "AMOUNT_MISMATCH";
    details = `Diferencia de ${r2(discrepancy)}€ entre liquidación teórica (${r2(expectedPayment)}€) y pago bancario (${totalPaid}€).`;
  }

  return {
    quarter,
    year,
    theoretical,
    bankPayments,
    totalPaid,
    discrepancy,
    discrepancyType,
    details,
  };
}
