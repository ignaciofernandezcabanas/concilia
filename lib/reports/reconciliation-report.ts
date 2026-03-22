/**
 * Reconciliation Report Generator.
 *
 * Compares the accounting balance (Holded / invoices) against the bank balance
 * for a given month. Lists unreconciled items in both directions and verifies
 * that the difference equals the sum of the unreconciled sections.
 */

import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnreconciledInvoice {
  invoiceId: string;
  number: string;
  type: string;
  issueDate: string;
  dueDate: string | null;
  totalAmount: number;
  amountPending: number;
  contactName: string | null;
  description: string | null;
}

export interface UnreconciledTransaction {
  transactionId: string;
  valueDate: string;
  amount: number;
  concept: string | null;
  counterpartName: string | null;
  counterpartIban: string | null;
  status: string;
  detectedType: string | null;
}

export interface ReconciliationReportData {
  companyId: string;
  month: string; // "2026-03"
  currency: string;

  /** Sum of invoice amounts (accrual basis) in the period */
  saldoHolded: number;
  /** Bank balance at end of month */
  saldoBanco: number;
  /** Difference: saldoHolded - saldoBanco */
  diferencia: number;

  /** Invoices without a matching bank transaction */
  unreconciledInvoices: UnreconciledInvoice[];
  /** Bank transactions without a matching invoice */
  unreconciledTransactions: UnreconciledTransaction[];

  /** Sum of unreconciled invoice amounts */
  totalUnreconciledInvoices: number;
  /** Sum of unreconciled transaction amounts */
  totalUnreconciledTransactions: number;
  /** Whether the difference equals the sum of unreconciled sections */
  balanceCheck: boolean;
  /** Residual amount not explained by unreconciled items */
  residual: number;

  reconciliationRate: number; // percentage (0-100)
  totalInvoicesInPeriod: number;
  totalTransactionsInPeriod: number;
  reconciledCount: number;

  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateReconciliationReport(
  companyId: string,
  month: string // "2026-03"
): Promise<ReconciliationReportData> {
  const [year, monthNum] = month.split("-").map(Number);
  const from = new Date(year, monthNum - 1, 1);
  const to = new Date(year, monthNum, 0, 23, 59, 59, 999); // last day of month

  // 1. Get all invoices in the period
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      issueDate: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    include: {
      contact: { select: { name: true } },
      reconciliations: {
        where: { status: { in: ["APPROVED", "AUTO_APPROVED"] } },
        select: { id: true },
      },
    },
  });

  // 2. Get all bank transactions in the period
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      companyId,
      valueDate: { gte: from, lte: to },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    include: {
      reconciliations: {
        where: { status: { in: ["APPROVED", "AUTO_APPROVED"] } },
        select: { id: true },
      },
    },
  });

  // 3. Calculate Holded balance (net of issued - received)
  const saldoHolded = invoices.reduce((sum, inv) => {
    const sign =
      inv.type === "ISSUED" || inv.type === "CREDIT_RECEIVED" ? 1 : -1;
    return sum + sign * inv.totalAmount;
  }, 0);

  // 4. Get bank balance at end of month
  const lastTx = await prisma.bankTransaction.findFirst({
    where: {
      companyId,
      valueDate: { lte: to },
      balanceAfter: { not: null },
      status: { notIn: ["DUPLICATE", "IGNORED"] },
    },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });
  const saldoBanco = lastTx?.balanceAfter ?? 0;

  // 5. Identify unreconciled invoices (no approved reconciliation)
  const unreconciledInvoices: UnreconciledInvoice[] = invoices
    .filter((inv) => inv.reconciliations.length === 0)
    .map((inv) => ({
      invoiceId: inv.id,
      number: inv.number,
      type: inv.type,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      dueDate: inv.dueDate?.toISOString().slice(0, 10) ?? null,
      totalAmount: inv.totalAmount,
      amountPending: inv.amountPending ?? inv.totalAmount - inv.amountPaid,
      contactName: inv.contact?.name ?? null,
      description: inv.description,
    }));

  // 6. Identify unreconciled bank transactions
  const unreconciledTransactions: UnreconciledTransaction[] = transactions
    .filter(
      (tx) =>
        tx.reconciliations.length === 0 &&
        tx.status !== "RECONCILED" &&
        tx.status !== "CLASSIFIED" &&
        tx.status !== "INTERNAL"
    )
    .map((tx) => ({
      transactionId: tx.id,
      valueDate: tx.valueDate.toISOString().slice(0, 10),
      amount: tx.amount,
      concept: tx.concept,
      counterpartName: tx.counterpartName,
      counterpartIban: tx.counterpartIban,
      status: tx.status,
      detectedType: tx.detectedType,
    }));

  // 7. Totals
  const totalUnreconciledInvoices = unreconciledInvoices.reduce(
    (sum, inv) => {
      // Use same sign convention as saldoHolded
      const sign =
        inv.type === "ISSUED" || inv.type === "CREDIT_RECEIVED" ? 1 : -1;
      return sum + sign * inv.amountPending;
    },
    0
  );

  const totalUnreconciledTransactions = unreconciledTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0
  );

  const diferencia = roundTwo(saldoHolded - saldoBanco);
  const expectedDifference = roundTwo(
    totalUnreconciledInvoices - totalUnreconciledTransactions
  );
  const residual = roundTwo(diferencia - expectedDifference);
  const balanceCheck = Math.abs(residual) < 0.01;

  // 8. Reconciliation rate
  const reconciledInvoiceCount = invoices.filter(
    (inv) => inv.reconciliations.length > 0
  ).length;
  const reconciledTxCount = transactions.filter(
    (tx) =>
      tx.reconciliations.length > 0 ||
      tx.status === "RECONCILED" ||
      tx.status === "CLASSIFIED" ||
      tx.status === "INTERNAL"
  ).length;

  const totalItems = invoices.length + transactions.length;
  const reconciledCount = reconciledInvoiceCount + reconciledTxCount;
  const reconciliationRate =
    totalItems > 0 ? roundTwo((reconciledCount / totalItems) * 100) : 100;

  return {
    companyId,
    month,
    currency: "EUR",
    saldoHolded: roundTwo(saldoHolded),
    saldoBanco: roundTwo(saldoBanco),
    diferencia,
    unreconciledInvoices,
    unreconciledTransactions,
    totalUnreconciledInvoices: roundTwo(totalUnreconciledInvoices),
    totalUnreconciledTransactions: roundTwo(totalUnreconciledTransactions),
    balanceCheck,
    residual,
    reconciliationRate,
    totalInvoicesInPeriod: invoices.length,
    totalTransactionsInPeriod: transactions.length,
    reconciledCount,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
