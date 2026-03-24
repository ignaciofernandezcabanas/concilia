import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateVatReport } from "@/lib/reports/vat-generator";

/**
 * GET /api/fiscal?type=vat|withholdings&from=2026-01-01&to=2026-03-31
 *
 * Fiscal report:
 * - vat: IVA repercutido vs soportado (Modelo 303)
 * - withholdings: retenciones IRPF (Modelo 111/115)
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const url = req.nextUrl;
  const type = url.searchParams.get("type") ?? "vat";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Query parameters "from" and "to" are required.' },
      { status: 400 }
    );
  }

  const dateFrom = new Date(from);
  const dateTo = new Date(to);

  if (type === "vat") {
    return NextResponse.json(await generateVatReport(db, ctx.company.id, dateFrom, dateTo));
  }

  if (type === "withholdings") {
    return NextResponse.json(
      await generateWithholdingsReport(db, ctx.company.id, dateFrom, dateTo)
    );
  }

  return NextResponse.json({ error: "Type must be 'vat' or 'withholdings'." }, { status: 400 });
}, "read:reports");

/**
 * Withholdings Report (Modelo 111/115).
 *
 * Sums withholding amounts from invoice lines that have a withholding rate.
 * Common in Spain for professional services (15% IRPF) and rent (19%).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateWithholdingsReport(db: any, companyId: string, from: Date, to: Date) {
  const invoices = await db.invoice.findMany({
    where: {
      companyId,
      type: "RECEIVED",
      issueDate: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    include: {
      lines: true,
      contact: { select: { name: true, cif: true } },
    },
  });

  // For now, estimate withholdings from netAmount vs totalAmount difference
  // In a full implementation, each InvoiceLine would have a withholdingRate field
  const withholdings: Array<{
    contactName: string;
    contactCif: string | null;
    invoiceNumber: string;
    date: string;
    base: number;
    withholdingAmount: number;
  }> = [];

  let totalBase = 0;
  let totalWithholding = 0;

  for (const inv of invoices) {
    // Estimate: if netAmount < totalAmount - vatAmount, the difference is withholding
    const netAmt = inv.netAmount ?? 0;
    const vatAmt = inv.vatAmount ?? 0;
    const estimatedWithholding = netAmt > 0 ? Math.max(0, inv.totalAmount - vatAmt - netAmt) : 0;

    if (estimatedWithholding > 0.01) {
      const base = inv.totalAmount - vatAmt;
      withholdings.push({
        contactName: inv.contact?.name ?? "—",
        contactCif: inv.contact?.cif ?? null,
        invoiceNumber: inv.number,
        date: inv.issueDate.toISOString().slice(0, 10),
        base: r2(base),
        withholdingAmount: r2(estimatedWithholding),
      });
      totalBase += base;
      totalWithholding += estimatedWithholding;
    }
  }

  return {
    type: "withholdings",
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    entries: withholdings,
    totals: {
      base: r2(totalBase),
      withholding: r2(totalWithholding),
      count: withholdings.length,
    },
  };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
