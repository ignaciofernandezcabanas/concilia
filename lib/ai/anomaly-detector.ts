/**
 * Anomaly Detector.
 *
 * Compares current month expenses per PGC account vs 6-month average.
 * z-score > 2 → anomaly. Returns max 10, sorted by |z-score| desc.
 */

import { prisma } from "@/lib/db";
import { callAI } from "@/lib/ai/model-router";
import { EXPLAIN_ANOMALY } from "@/lib/ai/prompt-registry";

export interface Anomaly {
  companyId: string;
  companyName: string;
  accountCode: string;
  accountName: string;
  currentAmount: number;
  avgAmount: number;
  zScore: number;
  explanation: string | null;
}

export async function detectAnomalies(orgId: string, month: string): Promise<Anomaly[]> {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr);
  const mon = parseInt(monthStr);

  const companies = await prisma.company.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, shortName: true },
  });

  const currentStart = new Date(year, mon - 1, 1);
  const currentEnd = new Date(year, mon, 0, 23, 59, 59);
  const sixMonthsAgo = new Date(year, mon - 7, 1);

  const anomalies: Anomaly[] = [];

  for (const company of companies) {
    // Current month classified txs grouped by account
    const currentTxs = await prisma.bankTransaction.findMany({
      where: {
        companyId: company.id,
        status: "CLASSIFIED",
        valueDate: { gte: currentStart, lte: currentEnd },
      },
      include: {
        classification: {
          include: { account: { select: { code: true, name: true } } },
        },
      },
    });

    const currentByAccount = new Map<string, { total: number; name: string; topTx: string }>();
    for (const tx of currentTxs) {
      if (!tx.classification?.account) continue;
      const code = tx.classification.account.code;
      const abs = Math.abs(tx.amount);
      const existing = currentByAccount.get(code);
      if (existing) {
        existing.total += abs;
        if (abs > parseFloat(existing.topTx.split("|")[0] || "0")) {
          existing.topTx = `${abs}|${tx.concept ?? ""}`;
        }
      } else {
        currentByAccount.set(code, {
          total: abs,
          name: tx.classification.account.name,
          topTx: `${abs}|${tx.concept ?? ""}`,
        });
      }
    }

    // Historical: 6 months, grouped by account and month
    const historicalTxs = await prisma.bankTransaction.findMany({
      where: {
        companyId: company.id,
        status: "CLASSIFIED",
        valueDate: { gte: sixMonthsAgo, lt: currentStart },
      },
      include: {
        classification: {
          include: { account: { select: { code: true } } },
        },
      },
    });

    // Group by account → monthly totals
    const historicalByAccount = new Map<string, Map<string, number>>();
    for (const tx of historicalTxs) {
      if (!tx.classification?.account) continue;
      const code = tx.classification.account.code;
      const monthKey = `${tx.valueDate.getFullYear()}-${String(tx.valueDate.getMonth() + 1).padStart(2, "0")}`;

      if (!historicalByAccount.has(code)) historicalByAccount.set(code, new Map());
      const monthMap = historicalByAccount.get(code)!;
      monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + Math.abs(tx.amount));
    }

    // Calculate z-scores
    for (const [code, current] of Array.from(currentByAccount)) {
      const monthlyTotals = historicalByAccount.get(code);
      if (!monthlyTotals || monthlyTotals.size < 3) continue; // Need ≥3 months

      const values = Array.from(monthlyTotals.values());
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      if (mean < 50) continue; // Skip negligible accounts

      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev < 1) continue;

      const zScore = (current.total - mean) / stdDev;

      if (Math.abs(zScore) > 2) {
        anomalies.push({
          companyId: company.id,
          companyName: company.shortName ?? company.name,
          accountCode: code,
          accountName: current.name,
          currentAmount: Math.round(current.total * 100) / 100,
          avgAmount: Math.round(mean * 100) / 100,
          zScore: Math.round(zScore * 10) / 10,
          explanation: null,
        });
      }
    }
  }

  // Sort by |z-score| descending, limit to 10
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  const top = anomalies.slice(0, 10);

  // Generate explanations for top anomalies
  for (const anomaly of top) {
    const topTxParts = Array.from(
      (await prisma.bankTransaction.findMany({
        where: {
          companyId: anomaly.companyId,
          status: "CLASSIFIED",
          valueDate: { gte: currentStart, lte: currentEnd },
          classification: { account: { code: anomaly.accountCode } },
        },
        orderBy: { amount: "asc" },
        take: 1,
        select: { amount: true, concept: true },
      }))
    );
    const topTx = topTxParts[0]
      ? `${Math.abs(topTxParts[0].amount).toFixed(2)} EUR — ${topTxParts[0].concept ?? "Sin concepto"}`
      : "N/A";

    anomaly.explanation = await callAI(
      "explain_anomaly",
      EXPLAIN_ANOMALY.system,
      EXPLAIN_ANOMALY.buildUser({
        accountCode: anomaly.accountCode,
        accountName: anomaly.accountName,
        currentAmount: anomaly.currentAmount,
        avgAmount: anomaly.avgAmount,
        zScore: anomaly.zScore,
        topTx,
      })
    );
  }

  return top;
}
