/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkGestoriaAccess } from "@/lib/auth/gestoria-check";
import { callAIJson } from "@/lib/ai/model-router";
import { GESTORIA_DAILY_ALERTS } from "@/lib/ai/prompt-registry";
import { getUpcomingDeadlines, type FiscalCompanyType } from "@/lib/fiscal/fiscal-matrix";

/**
 * GET /api/gestoria/alerts
 *
 * Generates prioritized fiscal alerts using AI based on
 * the company's fiscal calendar and pending items.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;

    const config = await checkGestoriaAccess(db, "reportes");
    if (!config) {
      return NextResponse.json(
        { error: "Gestoría no configurada o acceso insuficiente." },
        { status: 403 }
      );
    }

    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);

    // Determine company type for fiscal matrix
    const businessProfile = await (db as any).businessProfile?.findFirst?.();
    const companyType: FiscalCompanyType =
      (businessProfile?.tipoSociedad as FiscalCompanyType) ?? "SL_GENERAL";

    // Get upcoming deadlines (30 days)
    const upcomingDeadlines = getUpcomingDeadlines(companyType, 30, now);

    // Count pending documents
    const pendingDocs =
      (await (db as any).notification?.count?.({
        where: { type: "DOCUMENT_REQUEST", isRead: false },
      })) ?? 0;

    // Count overdue invoices
    const overdueItems = await db.invoice.count({
      where: { type: "ISSUED", status: "OVERDUE" },
    });

    const companies = [
      {
        name: ctx.company.name,
        cif: ctx.company.cif,
        companyType,
        pendingModels: upcomingDeadlines.map((d) => d.model),
      },
    ];

    const alerts = await callAIJson(
      "gestoria_daily_alerts",
      GESTORIA_DAILY_ALERTS.system,
      GESTORIA_DAILY_ALERTS.buildUser({
        companies,
        currentDate,
        upcomingDeadlines: upcomingDeadlines.map((d) => ({
          model: d.model,
          period: d.period,
          dueDate: d.dueDate,
        })),
        pendingDocs,
        overdueItems,
      }),
      GESTORIA_DAILY_ALERTS.schema
    );

    return NextResponse.json({ alerts: alerts ?? [], generatedAt: currentDate });
  } catch (err) {
    return errorResponse("Error generating gestoría alerts", err);
  }
});
