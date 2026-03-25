/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkGestoriaAccess } from "@/lib/auth/gestoria-check";
import { callAIJson } from "@/lib/ai/model-router";
import { GESTORIA_REVIEW_DRAFT } from "@/lib/ai/prompt-registry";

/**
 * GET /api/gestoria/drafts/[model]/[period]
 *
 * Reviews a specific fiscal draft using AI. Returns review with discrepancies.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    try {
      const db = ctx.db;
      const model = ctx.params?.model;
      const period = ctx.params?.period;

      if (!model || !period) {
        return NextResponse.json({ error: "Model and period are required." }, { status: 400 });
      }

      const config = await checkGestoriaAccess(db, "reportes");
      if (!config) {
        return NextResponse.json(
          { error: "Gestoría no configurada o acceso insuficiente." },
          { status: 403 }
        );
      }

      // Build draft data from fiscal records
      const currentDraft = await buildDraftData(db, model, period);
      const priorPeriod = await buildPriorPeriodData(db, model, period);

      const review = await callAIJson(
        "gestoria_review_draft",
        GESTORIA_REVIEW_DRAFT.system,
        GESTORIA_REVIEW_DRAFT.buildUser({
          model,
          period,
          companyName: ctx.company.name,
          currentDraft,
          priorPeriod,
        }),
        GESTORIA_REVIEW_DRAFT.schema
      );

      return NextResponse.json({ review, model, period });
    } catch (err) {
      return errorResponse("Error reviewing fiscal draft", err);
    }
  }
);

/**
 * POST /api/gestoria/drafts/[model]/[period]
 *
 * Approves a fiscal draft. Creates a notification for the controller.
 */
const approveSchema = z.object({
  action: z.literal("approve"),
  notes: z.string().optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    try {
      const db = ctx.db;
      const model = ctx.params?.model;
      const period = ctx.params?.period;

      if (!model || !period) {
        return NextResponse.json({ error: "Model and period are required." }, { status: 400 });
      }

      const config = await checkGestoriaAccess(db, "completo");
      if (!config) {
        return NextResponse.json(
          { error: "Gestoría no configurada o acceso insuficiente (requiere nivel completo)." },
          { status: 403 }
        );
      }

      const body = await req.json();
      const parsed = approveSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request body.", details: parsed.error.issues },
          { status: 400 }
        );
      }

      // Create notification for controller
      await db.notification.create({
        data: {
          type: "GESTORIA_ALERT" as any,
          title: `Borrador ${model} (${period}) aprobado por gestoría`,
          body: `${config.gestoriaName ?? "Gestoría"} ha aprobado el borrador del modelo ${model} para el periodo ${period}.${parsed.data.notes ? ` Notas: ${parsed.data.notes}` : ""}`,
          userId: ctx.user.id,
          companyId: ctx.company.id,
        },
      });

      return NextResponse.json({ success: true, model, period, action: "approved" });
    } catch (err) {
      return errorResponse("Error approving fiscal draft", err);
    }
  }
);

// ── Helpers ──

async function buildDraftData(
  db: any,
  model: string,
  period: string
): Promise<Record<string, unknown>> {
  if (model === "303") {
    // IVA data
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

    return {
      model,
      period,
      baseImponible: invoicesIssued.reduce(
        (sum: number, inv: any) => sum + (inv.netAmount ?? 0),
        0
      ),
      ivaRepercutido,
      ivaSoportado,
      cuotaDiferencial: ivaRepercutido - ivaSoportado,
      facturas: invoicesIssued.length + invoicesReceived.length,
    };
  }

  if (model === "111") {
    // Withholdings on work/professional services
    const invoices = await db.invoice.findMany({
      where: { type: "RECEIVED", status: { not: "CANCELLED" } },
      include: { lines: true },
    });

    let totalBase = 0;
    let totalWithholding = 0;
    let perceptores = 0;
    for (const inv of invoices) {
      const withholdingAmt = (inv as any).withholdingAmount ?? 0;
      if (withholdingAmt > 0) {
        totalBase += inv.netAmount ?? 0;
        totalWithholding += withholdingAmt;
        perceptores++;
      }
    }

    return {
      model,
      period,
      baseRetencion: totalBase,
      retencion: totalWithholding,
      tipoRetencion: 0.15,
      perceptores,
    };
  }

  return { model, period, data: "No data available" };
}

async function buildPriorPeriodData(
  db: any,
  model: string,
  period: string
): Promise<Record<string, unknown> | null> {
  // Parse period to get prior quarter
  const match = period.match(/T(\d)-(\d{4})/);
  if (!match) return null;

  const quarter = parseInt(match[1]);
  const year = parseInt(match[2]);
  const prevQuarter = quarter === 1 ? 4 : quarter - 1;
  const prevYear = quarter === 1 ? year - 1 : year;
  const priorPeriod = `T${prevQuarter}-${prevYear}`;

  // Try to build same data for prior period
  return buildDraftData(db, model, priorPeriod);
}
