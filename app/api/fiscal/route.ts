import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

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
 * IVA Report (Modelo 303).
 *
 * IVA repercutido (output VAT) from ISSUED invoices
 * IVA soportado (input VAT) from RECEIVED invoices
 * Difference = amount to pay (or claim)
 */
async function generateVatReport(db: any, companyId: string, from: Date, to: Date) {
  // Issued invoices → IVA repercutido
  const issuedLines = await db.invoiceLine.findMany({
    where: {
      invoice: {
        companyId,
        type: { in: ["ISSUED", "CREDIT_ISSUED"] },
        issueDate: { gte: from, lte: to },
        status: { not: "CANCELLED" },
      },
    },
    include: {
      invoice: {
        select: {
          number: true,
          issueDate: true,
          type: true,
          totalAmount: true,
          contact: { select: { name: true, cif: true } },
        },
      },
    },
  });

  // Received invoices → IVA soportado
  const receivedLines = await db.invoiceLine.findMany({
    where: {
      invoice: {
        companyId,
        type: { in: ["RECEIVED", "CREDIT_RECEIVED"] },
        issueDate: { gte: from, lte: to },
        status: { not: "CANCELLED" },
      },
    },
    include: {
      invoice: {
        select: {
          number: true,
          issueDate: true,
          type: true,
          totalAmount: true,
          contact: { select: { name: true, cif: true } },
        },
      },
    },
  });

  // Group by VAT rate
  const groupByRate = (lines: typeof issuedLines) => {
    const groups = new Map<number, { base: number; vat: number; count: number }>();
    for (const line of lines) {
      const rate = line.vatRate ?? 0;
      const existing = groups.get(rate);
      const base = line.totalAmount / (1 + rate / 100);
      const vatAmount = line.totalAmount - base;
      if (existing) {
        existing.base += base;
        existing.vat += vatAmount;
        existing.count++;
      } else {
        groups.set(rate, { base, vat: vatAmount, count: 1 });
      }
    }
    return Array.from(groups.entries())
      .map(([rate, data]) => ({
        rate,
        base: r2(data.base),
        vat: r2(data.vat),
        total: r2(data.base + data.vat),
        count: data.count,
      }))
      .sort((a, b) => a.rate - b.rate);
  };

  const ivaRepercutido = groupByRate(issuedLines);
  const ivaSoportado = groupByRate(receivedLines);

  const totalRepercutido = ivaRepercutido.reduce((s, g) => s + g.vat, 0);
  const totalSoportado = ivaSoportado.reduce((s, g) => s + g.vat, 0);
  const liquidacion = r2(totalRepercutido - totalSoportado);

  return {
    type: "vat",
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    ivaRepercutido: {
      byRate: ivaRepercutido,
      totalBase: r2(ivaRepercutido.reduce((s, g) => s + g.base, 0)),
      totalVat: r2(totalRepercutido),
    },
    ivaSoportado: {
      byRate: ivaSoportado,
      totalBase: r2(ivaSoportado.reduce((s, g) => s + g.base, 0)),
      totalVat: r2(totalSoportado),
    },
    liquidacion: {
      amount: liquidacion,
      direction: liquidacion >= 0 ? "A_INGRESAR" : "A_COMPENSAR",
    },
  };
}

/**
 * Withholdings Report (Modelo 111/115).
 *
 * Sums withholding amounts from invoice lines that have a withholding rate.
 * Common in Spain for professional services (15% IRPF) and rent (19%).
 */
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
