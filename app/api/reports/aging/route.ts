import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/reports/aging?type=receivable|payable&asOf=2026-03-31
 *
 * Aging report (Informe de Antigüedad).
 * Groups pending invoices into aging buckets by days past due:
 *   Current (not yet due), 1-30, 31-60, 61-90, 90+
 *
 * Returns:
 * - Summary by bucket
 * - Detail by contact with per-bucket amounts
 * - DSO/DPO calculation
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const url = req.nextUrl;
  const type = url.searchParams.get("type") ?? "receivable";
  const asOfParam = url.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();

  const isReceivable = type === "receivable";

  // Fetch pending invoices
  const invoices = await db.invoice.findMany({
    where: {
      companyId: ctx.company.id,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      type: isReceivable
        ? { in: ["ISSUED", "CREDIT_RECEIVED"] }
        : { in: ["RECEIVED", "CREDIT_ISSUED"] },
    },
    include: {
      contact: { select: { id: true, name: true, cif: true, avgPaymentDays: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Aging buckets
  const BUCKETS = [
    { label: "Corriente", min: -Infinity, max: 0 },
    { label: "1-30 días", min: 1, max: 30 },
    { label: "31-60 días", min: 31, max: 60 },
    { label: "61-90 días", min: 61, max: 90 },
    { label: "90+ días", min: 91, max: Infinity },
  ];

  // Per-contact aging
  const contactMap = new Map<
    string,
    {
      contactId: string;
      contactName: string;
      cif: string | null;
      buckets: number[];
      total: number;
      invoiceCount: number;
      avgDaysOverdue: number;
      oldestDueDate: string | null;
    }
  >();

  const bucketTotals = [0, 0, 0, 0, 0];
  let totalAmount = 0;
  let totalWeightedDays = 0;

  for (const inv of invoices) {
    const pending = inv.amountPending ?? inv.totalAmount - inv.amountPaid;
    if (pending <= 0) continue;

    const dueDate = inv.dueDate ?? inv.issueDate;
    const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    // Find bucket
    let bucketIdx = 0;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (daysPastDue >= BUCKETS[i].min && daysPastDue <= BUCKETS[i].max) {
        bucketIdx = i;
        break;
      }
    }

    bucketTotals[bucketIdx] += pending;
    totalAmount += pending;
    totalWeightedDays += pending * Math.max(0, daysPastDue);

    // Per-contact
    const contactKey = inv.contactId ?? "unknown";
    const existing = contactMap.get(contactKey);
    if (existing) {
      existing.buckets[bucketIdx] += pending;
      existing.total += pending;
      existing.invoiceCount++;
      existing.avgDaysOverdue += daysPastDue;
      if (!existing.oldestDueDate || dueDate.toISOString() < existing.oldestDueDate) {
        existing.oldestDueDate = dueDate.toISOString().slice(0, 10);
      }
    } else {
      const buckets = [0, 0, 0, 0, 0];
      buckets[bucketIdx] = pending;
      contactMap.set(contactKey, {
        contactId: contactKey,
        contactName: inv.contact?.name ?? "Sin contacto",
        cif: inv.contact?.cif ?? null,
        buckets,
        total: pending,
        invoiceCount: 1,
        avgDaysOverdue: daysPastDue,
        oldestDueDate: dueDate.toISOString().slice(0, 10),
      });
    }
  }

  // Finalize per-contact averages and sort by total descending
  const contacts = Array.from(contactMap.values())
    .map((c) => ({
      ...c,
      avgDaysOverdue: Math.round(c.avgDaysOverdue / c.invoiceCount),
    }))
    .sort((a, b) => b.total - a.total);

  // DSO/DPO calculation
  // Weighted average days = sum(pending * daysPastDue) / sum(pending)
  const weightedAvgDays = totalAmount > 0 ? Math.round(totalWeightedDays / totalAmount) : 0;

  // Revenue/cost for DSO/DPO (last 12 months)
  const twelveMonthsAgo = new Date(asOf);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const annualAmount = await db.invoice.aggregate({
    where: {
      companyId: ctx.company.id,
      type: isReceivable ? { in: ["ISSUED"] } : { in: ["RECEIVED"] },
      issueDate: { gte: twelveMonthsAgo, lte: asOf },
      status: { not: "CANCELLED" },
    },
    _sum: { totalAmount: true },
  });

  const annual = annualAmount._sum.totalAmount ?? 0;
  const dso = annual > 0 ? Math.round((totalAmount / annual) * 365) : 0;

  return NextResponse.json({
    type,
    asOf: asOf.toISOString().slice(0, 10),
    summary: {
      buckets: BUCKETS.map((b, i) => ({
        label: b.label,
        amount: roundTwo(bucketTotals[i]),
        percentage: totalAmount > 0 ? roundTwo((bucketTotals[i] / totalAmount) * 100) : 0,
      })),
      totalAmount: roundTwo(totalAmount),
      invoiceCount: invoices.length,
      contactCount: contacts.length,
      [isReceivable ? "dso" : "dpo"]: dso,
      weightedAvgDaysOverdue: weightedAvgDays,
    },
    contacts,
  });
}, "read:reports");

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
