/**
 * Treasury Forecast Generator.
 *
 * Projects future cash position based on:
 * 1. Current bank balance (latest balanceAfter)
 * 2. Pending invoices (issued → expected cobros, received → expected pagos)
 * 3. Recurring classified transactions (learned from last 3 months)
 * 4. Known overdue invoices
 *
 * Produces a week-by-week or month-by-month forecast.
 */

import { prisma } from "@/lib/db";

export interface ForecastWeek {
  weekStart: string; // ISO date
  weekEnd: string;
  expectedInflows: number;
  expectedOutflows: number;
  netFlow: number;
  projectedBalance: number;
  details: ForecastItem[];
}

export interface ForecastItem {
  type: "invoice_cobro" | "invoice_pago" | "recurring" | "overdue";
  description: string;
  amount: number;
  dueDate: string;
  probability: number; // 0-1
  sourceId: string | null;
}

export interface ForecastReport {
  companyId: string;
  currentBalance: number;
  balanceDate: string;
  weeks: ForecastWeek[];
  totals: {
    totalExpectedInflows: number;
    totalExpectedOutflows: number;
    projectedEndBalance: number;
  };
  horizon: number; // weeks
  generatedAt: string;
}

/**
 * Generates a treasury forecast for the next N weeks.
 */
export async function generateForecast(
  companyId: string,
  horizonWeeks: number = 12
): Promise<ForecastReport> {
  const now = new Date();

  // 1. Get current bank balance from latest transaction
  const latestTx = await prisma.bankTransaction.findFirst({
    where: { companyId, balanceAfter: { not: null } },
    orderBy: { valueDate: "desc" },
    select: { balanceAfter: true, valueDate: true },
  });

  const currentBalance = latestTx?.balanceAfter ?? 0;
  const balanceDate = latestTx?.valueDate ?? now;

  // 2. Get pending invoices with due dates
  const pendingInvoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      dueDate: { not: null },
    },
    include: {
      contact: { select: { name: true, avgPaymentDays: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  // 3. Get recurring patterns from last 3 months
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const classifiedTx = await prisma.bankTransaction.findMany({
    where: {
      companyId,
      status: "CLASSIFIED",
      valueDate: { gte: threeMonthsAgo },
      classification: { isNot: null },
    },
    include: {
      classification: {
        include: { account: { select: { code: true, name: true } } },
      },
    },
    orderBy: { valueDate: "asc" },
  });

  // Detect recurring patterns: group by concept+amount, find monthly recurrence
  const recurringPatterns = detectRecurringPatterns(classifiedTx);

  // 4. Build weekly forecast
  const weeks: ForecastWeek[] = [];
  let runningBalance = currentBalance;

  for (let w = 0; w < horizonWeeks; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() + w * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const items: ForecastItem[] = [];

    // Pending invoices due this week
    for (const inv of pendingInvoices) {
      if (!inv.dueDate) continue;
      const due = new Date(inv.dueDate);
      if (due < weekStart || due > weekEnd) continue;

      const pending = inv.amountPending ?? inv.totalAmount - inv.amountPaid;
      if (pending <= 0) continue;

      const isIssued = inv.type === "ISSUED" || inv.type === "CREDIT_ISSUED";
      const avgDelay = inv.contact?.avgPaymentDays ?? 0;
      // Probability decreases with age and if overdue
      const isOverdue = inv.status === "OVERDUE";
      const probability = isOverdue ? 0.5 : avgDelay > 15 ? 0.7 : 0.9;

      items.push({
        type: isIssued ? "invoice_cobro" : "invoice_pago",
        description: `${inv.number} — ${inv.contact?.name ?? ""}`,
        amount: isIssued ? pending : -pending,
        dueDate: due.toISOString().slice(0, 10),
        probability,
        sourceId: inv.id,
      });
    }

    // Recurring patterns expected this week
    for (const pattern of recurringPatterns) {
      // Check if this pattern is expected in this week
      const expectedDay = pattern.avgDayOfMonth;
      const weekMonth = weekStart.getMonth();
      const expectedDate = new Date(weekStart.getFullYear(), weekMonth, expectedDay);

      if (expectedDate >= weekStart && expectedDate <= weekEnd) {
        items.push({
          type: "recurring",
          description: pattern.description,
          amount: pattern.avgAmount,
          dueDate: expectedDate.toISOString().slice(0, 10),
          probability: pattern.confidence,
          sourceId: null,
        });
      }
    }

    const expectedInflows = items
      .filter((i) => i.amount > 0)
      .reduce((s, i) => s + i.amount * i.probability, 0);
    const expectedOutflows = items
      .filter((i) => i.amount < 0)
      .reduce((s, i) => s + Math.abs(i.amount) * i.probability, 0);
    const netFlow = roundTwo(expectedInflows - expectedOutflows);

    runningBalance = roundTwo(runningBalance + netFlow);

    weeks.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      expectedInflows: roundTwo(expectedInflows),
      expectedOutflows: roundTwo(expectedOutflows),
      netFlow,
      projectedBalance: runningBalance,
      details: items,
    });
  }

  const totalInflows = weeks.reduce((s, w) => s + w.expectedInflows, 0);
  const totalOutflows = weeks.reduce((s, w) => s + w.expectedOutflows, 0);

  return {
    companyId,
    currentBalance,
    balanceDate: balanceDate.toISOString().slice(0, 10),
    weeks,
    totals: {
      totalExpectedInflows: roundTwo(totalInflows),
      totalExpectedOutflows: roundTwo(totalOutflows),
      projectedEndBalance: runningBalance,
    },
    horizon: horizonWeeks,
    generatedAt: new Date().toISOString(),
  };
}

// ── Recurring pattern detection ──

interface RecurringPattern {
  description: string;
  avgAmount: number;
  avgDayOfMonth: number;
  occurrences: number;
  confidence: number;
}

interface ClassifiedTx {
  amount: number;
  valueDate: Date;
  concept: string | null;
  conceptParsed: string | null;
  counterpartName: string | null;
  classification: {
    description: string | null;
    account: { code: string; name: string };
  } | null;
}

function detectRecurringPatterns(transactions: ClassifiedTx[]): RecurringPattern[] {
  // Group by counterpartName or concept similarity + similar amount (±20%)
  const groups = new Map<string, ClassifiedTx[]>();

  for (const tx of transactions) {
    const key = (tx.counterpartName ?? tx.conceptParsed ?? tx.concept ?? "unknown")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const existing = groups.get(key);
    if (existing) {
      existing.push(tx);
    } else {
      groups.set(key, [tx]);
    }
  }

  const patterns: RecurringPattern[] = [];

  for (const [, txs] of Array.from(groups)) {
    // Need at least 2 occurrences to be "recurring"
    if (txs.length < 2) continue;

    // Check amount consistency (within 20%)
    const amounts = txs.map((t) => t.amount);
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const allSimilar = amounts.every(
      (a) => Math.abs(a - avgAmount) / Math.abs(avgAmount) < 0.2
    );
    if (!allSimilar) continue;

    // Check monthly recurrence (occurrences in different months)
    const months = new Set(txs.map((t) => `${t.valueDate.getFullYear()}-${t.valueDate.getMonth()}`));
    if (months.size < 2) continue;

    const avgDay = Math.round(
      txs.reduce((s, t) => s + t.valueDate.getDate(), 0) / txs.length
    );

    const desc =
      txs[0].classification?.description ??
      txs[0].counterpartName ??
      txs[0].conceptParsed ??
      "Recurrente";

    patterns.push({
      description: desc,
      avgAmount: roundTwo(avgAmount),
      avgDayOfMonth: avgDay,
      occurrences: txs.length,
      confidence: Math.min(0.9, 0.5 + txs.length * 0.1),
    });
  }

  return patterns;
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
