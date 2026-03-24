/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * VAT report generator — extracted from app/api/fiscal/route.ts.
 *
 * Calculates IVA repercutido (output VAT) from ISSUED invoices and
 * IVA soportado (input VAT) from RECEIVED invoices for a given period.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface VatRateGroup {
  rate: number;
  base: number;
  vat: number;
  total: number;
  count: number;
}

export interface VatReport {
  type: "vat";
  period: { from: string; to: string };
  ivaRepercutido: {
    byRate: VatRateGroup[];
    totalBase: number;
    totalVat: number;
  };
  ivaSoportado: {
    byRate: VatRateGroup[];
    totalBase: number;
    totalVat: number;
  };
  liquidacion: {
    amount: number;
    direction: "A_INGRESAR" | "A_COMPENSAR";
  };
}

/**
 * Generate VAT report (Modelo 303) for a period.
 *
 * @param companyId Needed because InvoiceLine is NOT a scoped model —
 *   we filter by invoice.companyId explicitly.
 */
export async function generateVatReport(
  db: ScopedPrisma,
  companyId: string,
  from: Date,
  to: Date
): Promise<VatReport> {
  // Issued invoices → IVA repercutido
  const issuedLines = await (db as any).invoiceLine.findMany({
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
  const receivedLines = await (db as any).invoiceLine.findMany({
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
  const groupByRate = (lines: typeof issuedLines): VatRateGroup[] => {
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
