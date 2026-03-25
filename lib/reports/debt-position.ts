/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Debt Position Report.
 *
 * Generates a summary of all active debt instruments including:
 * - Total debt and net debt (debt - cash)
 * - Available credit lines
 * - DSCR (Debt Service Coverage Ratio)
 * - Overdue installments
 * - At-risk covenants
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebtInstrumentSummary {
  id: string;
  name: string;
  type: string;
  bankEntityName: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRateType: string;
  interestRateValue: number;
  maturityDate: string;
  status: string;
  creditLimit: number | null;
  currentDrawdown: number | null;
  availableCredit: number | null;
}

export interface OverdueInstallment {
  debtInstrumentId: string;
  debtInstrumentName: string;
  entryNumber: number;
  dueDate: string;
  totalAmount: number;
  daysOverdue: number;
}

export interface CovenantStatus {
  id: string;
  debtInstrumentName: string;
  name: string;
  metric: string;
  threshold: number;
  operator: string;
  lastTestedValue: number | null;
  isCompliant: boolean | null;
  atRisk: boolean;
}

export interface DebtPositionSummary {
  totalDebt: number;
  totalDebtLongTerm: number;
  totalDebtShortTerm: number;
  cashBalance: number;
  netDebt: number;
  totalCreditLimit: number;
  totalDrawdown: number;
  availableCredit: number;
  weightedAvgRate: number;
  dscr: number | null;
  instruments: DebtInstrumentSummary[];
  overdueInstallments: OverdueInstallment[];
  covenants: CovenantStatus[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateDebtPosition(db: ScopedPrisma): Promise<DebtPositionSummary> {
  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  // Load active debt instruments with covenants and schedule
  const instruments = await (db as any).debtInstrument.findMany({
    where: { status: "ACTIVE" },
    include: {
      covenants: true,
      schedule: {
        where: { matched: false, dueDate: { lt: now } },
        orderBy: { dueDate: "asc" },
      },
    },
  });

  // Cash balance — latest bank transaction with balanceAfter
  const lastTx = await db.bankTransaction.findFirst({
    where: { balanceAfter: { not: null }, status: { notIn: ["DUPLICATE", "IGNORED"] } },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true },
  });
  const cashBalance = lastTx?.balanceAfter ?? 0;

  // Build instrument summaries
  const instrumentSummaries: DebtInstrumentSummary[] = [];
  let totalDebt = 0;
  let totalDebtLongTerm = 0;
  let totalDebtShortTerm = 0;
  let totalCreditLimit = 0;
  let totalDrawdown = 0;
  let weightedRateSum = 0;

  for (const inst of instruments) {
    const outstanding = inst.outstandingBalance ?? 0;
    totalDebt += outstanding;

    // Short-term: maturing within 1 year
    const maturityDate = new Date(inst.maturityDate);
    if (maturityDate <= oneYearFromNow) {
      totalDebtShortTerm += outstanding;
    } else {
      totalDebtLongTerm += outstanding;
    }

    weightedRateSum += outstanding * inst.interestRateValue;

    const isRevolving =
      inst.type === "REVOLVING_CREDIT" ||
      inst.type === "OVERDRAFT" ||
      inst.type === "DISCOUNT_LINE";
    const creditLimit = isRevolving ? (inst.creditLimit ?? 0) : null;
    const currentDrawdown = isRevolving ? (inst.currentDrawdown ?? 0) : null;

    if (creditLimit != null) {
      totalCreditLimit += creditLimit;
      totalDrawdown += currentDrawdown ?? 0;
    }

    instrumentSummaries.push({
      id: inst.id,
      name: inst.name,
      type: inst.type,
      bankEntityName: inst.bankEntityName,
      principalAmount: inst.principalAmount,
      outstandingBalance: outstanding,
      interestRateType: inst.interestRateType,
      interestRateValue: inst.interestRateValue,
      maturityDate: maturityDate.toISOString().slice(0, 10),
      status: inst.status,
      creditLimit,
      currentDrawdown,
      availableCredit: creditLimit != null ? round2(creditLimit - (currentDrawdown ?? 0)) : null,
    });
  }

  const availableCredit = round2(totalCreditLimit - totalDrawdown);
  const netDebt = round2(totalDebt - cashBalance);
  const weightedAvgRate = totalDebt > 0 ? round2(weightedRateSum / totalDebt) : 0;

  // Overdue installments
  const overdueInstallments: OverdueInstallment[] = [];
  for (const inst of instruments) {
    for (const entry of inst.schedule) {
      const dueDate = new Date(entry.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
      if (daysOverdue > 0) {
        overdueInstallments.push({
          debtInstrumentId: inst.id,
          debtInstrumentName: inst.name,
          entryNumber: entry.entryNumber,
          dueDate: dueDate.toISOString().slice(0, 10),
          totalAmount: entry.totalAmount,
          daysOverdue,
        });
      }
    }
  }

  // DSCR: annual debt service / EBITDA proxy
  // Use last 12 months of debt transactions for annual service
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const debtTxs = await (db as any).debtTransaction.findMany({
    where: {
      date: { gte: twelveMonthsAgo },
      type: {
        in: ["INSTALLMENT_PRINCIPAL", "INSTALLMENT_INTEREST", "INTEREST_PAYMENT", "LEASE_PAYMENT"],
      },
    },
  });
  const annualDebtService = debtTxs.reduce((s: number, t: any) => s + Math.abs(t.amount), 0);

  // Simple EBITDA proxy from operating cash flow
  const operatingTxs = await db.bankTransaction.findMany({
    where: {
      valueDate: { gte: twelveMonthsAgo },
      status: { in: ["RECONCILED", "CLASSIFIED"] },
      economicCategory: { in: ["OPERATING_INCOME", "OPERATING_EXPENSE"] },
    },
    select: { amount: true },
  });
  const operatingCashFlow = operatingTxs.reduce(
    (s: number, t: { amount: number }) => s + t.amount,
    0
  );
  const dscr = annualDebtService > 0 ? round2(operatingCashFlow / annualDebtService) : null;

  // Covenants
  const covenantStatuses: CovenantStatus[] = [];
  for (const inst of instruments) {
    for (const cov of inst.covenants) {
      const atRisk = cov.lastTestedValue != null && !cov.isCompliant;
      covenantStatuses.push({
        id: cov.id,
        debtInstrumentName: inst.name,
        name: cov.name,
        metric: cov.metric,
        threshold: cov.threshold,
        operator: cov.operator,
        lastTestedValue: cov.lastTestedValue,
        isCompliant: cov.isCompliant,
        atRisk,
      });
    }
  }

  return {
    totalDebt: round2(totalDebt),
    totalDebtLongTerm: round2(totalDebtLongTerm),
    totalDebtShortTerm: round2(totalDebtShortTerm),
    cashBalance: round2(cashBalance),
    netDebt: round2(netDebt),
    totalCreditLimit: round2(totalCreditLimit),
    totalDrawdown: round2(totalDrawdown),
    availableCredit,
    weightedAvgRate,
    dscr,
    instruments: instrumentSummaries,
    overdueInstallments,
    covenants: covenantStatuses,
    generatedAt: now.toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
