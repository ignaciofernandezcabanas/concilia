import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/reports/dashboard?from=2026-03-01&to=2026-03-31
 *
 * Returns pre-aggregated KPIs for the dashboard. All sums are done in the DB.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const { company } = ctx;
  const { searchParams } = req.nextUrl;

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: '"from" and "to" query params required.' }, { status: 400 });
  }

  const from = new Date(fromParam);
  const to = new Date(toParam);

  const [
    incomeAgg,
    expenseAgg,
    cashflowAgg,
    pendingCount,
    reconciledAgg,
    pendingMatchAgg,
    unclassifiedAgg,
  ] = await Promise.all([
    db.invoice.aggregate({
      where: {
        companyId: company.id,
        issueDate: { gte: from, lte: to },
        type: { in: ["ISSUED", "CREDIT_RECEIVED"] },
        status: { not: "CANCELLED" },
      },
      _sum: { totalAmount: true },
    }),
    db.invoice.aggregate({
      where: {
        companyId: company.id,
        issueDate: { gte: from, lte: to },
        type: { in: ["RECEIVED", "CREDIT_ISSUED"] },
        status: { not: "CANCELLED" },
      },
      _sum: { totalAmount: true },
    }),
    db.bankTransaction.aggregate({
      where: {
        companyId: company.id,
        valueDate: { gte: from, lte: to },
        status: { notIn: ["DUPLICATE", "IGNORED"] },
      },
      _sum: { amount: true },
    }),
    db.bankTransaction.count({
      where: { companyId: company.id, status: "PENDING" },
    }),
    db.bankTransaction.aggregate({
      where: { companyId: company.id, valueDate: { gte: from, lte: to }, status: "RECONCILED" },
      _sum: { amount: true },
      _count: true,
    }),
    db.bankTransaction.aggregate({
      where: { companyId: company.id, valueDate: { gte: from, lte: to }, status: "PENDING" },
      _sum: { amount: true },
      _count: true,
    }),
    db.bankTransaction.aggregate({
      where: {
        companyId: company.id,
        valueDate: { gte: from, lte: to },
        status: {
          notIn: ["RECONCILED", "CLASSIFIED", "PENDING", "DUPLICATE", "IGNORED", "INTERNAL"],
        },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    income: incomeAgg._sum.totalAmount ?? 0,
    expenses: expenseAgg._sum.totalAmount ?? 0,
    cashflow: cashflowAgg._sum.amount ?? 0,
    pendingCount,
    reconciled: {
      count: reconciledAgg._count,
      amount: Math.abs(reconciledAgg._sum.amount ?? 0),
    },
    pendingMatch: {
      count: pendingMatchAgg._count,
      amount: Math.abs(pendingMatchAgg._sum.amount ?? 0),
    },
    unclassified: {
      count: unclassifiedAgg._count,
      amount: Math.abs(unclassifiedAgg._sum.amount ?? 0),
    },
  });
}, "read:dashboard");
