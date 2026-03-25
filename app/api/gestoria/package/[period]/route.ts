/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkGestoriaAccess } from "@/lib/auth/gestoria-check";

/**
 * GET /api/gestoria/package/[period]
 *
 * Generates a fiscal summary package as JSON for the given period.
 * Includes 303 IVA data, 111 withholdings, and aging summary.
 *
 * TODO: Add actual ZIP file generation with Excel export.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    try {
      const db = ctx.db;
      const period = ctx.params?.period;

      if (!period) {
        return NextResponse.json({ error: "Period is required." }, { status: 400 });
      }

      const config = await checkGestoriaAccess(db, "reportes");
      if (!config) {
        return NextResponse.json(
          { error: "Gestoría no configurada o acceso insuficiente." },
          { status: 403 }
        );
      }

      // Build IVA summary (303)
      const invoicesIssued = await db.invoice.findMany({
        where: { type: "ISSUED", status: { not: "CANCELLED" } },
        include: { lines: true },
      });
      const invoicesReceived = await db.invoice.findMany({
        where: { type: "RECEIVED", status: { not: "CANCELLED" } },
        include: { lines: true },
      });

      const ivaRepercutido = invoicesIssued.reduce(
        (sum: number, inv: any) => sum + (inv.vatAmount ?? 0),
        0
      );
      const ivaSoportado = invoicesReceived.reduce(
        (sum: number, inv: any) => sum + (inv.vatAmount ?? 0),
        0
      );

      // Build withholdings summary (111)
      // Withholdings are tracked at invoice level (withholdingAmount field)
      let totalWithholdings = 0;
      let withholdingPerceptores = 0;
      for (const inv of invoicesReceived) {
        const withholdingAmt = (inv as any).withholdingAmount ?? 0;
        if (withholdingAmt > 0) {
          totalWithholdings += withholdingAmt;
          withholdingPerceptores++;
        }
      }

      // Aging summary
      const overdueInvoices = await db.invoice.count({
        where: { type: "ISSUED", status: "OVERDUE" },
      });
      const pendingInvoices = await db.invoice.count({
        where: { type: "ISSUED", status: "PENDING" },
      });

      const fiscalPackage = {
        company: {
          name: ctx.company.name,
          cif: ctx.company.cif,
        },
        period,
        generatedAt: new Date().toISOString(),
        gestoria: config.gestoriaName,
        modelo303: {
          baseImponible: invoicesIssued.reduce(
            (sum: number, inv: any) => sum + (inv.netAmount ?? 0),
            0
          ),
          ivaRepercutido,
          ivaSoportado,
          cuotaDiferencial: ivaRepercutido - ivaSoportado,
          facturasEmitidas: invoicesIssued.length,
          facturasRecibidas: invoicesReceived.length,
        },
        modelo111: {
          baseRetencion: totalWithholdings / 0.15 || 0,
          retencion: totalWithholdings,
          perceptores: withholdingPerceptores,
        },
        aging: {
          overdueCount: overdueInvoices,
          pendingCount: pendingInvoices,
        },
      };

      // TODO: Generate actual ZIP with Excel files for download

      return NextResponse.json({ package: fiscalPackage });
    } catch (err) {
      return errorResponse("Error generating gestoría package", err);
    }
  }
);
