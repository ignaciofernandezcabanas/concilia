/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkGestoriaAccess } from "@/lib/auth/gestoria-check";
import {
  getUpcomingDeadlines,
  FISCAL_MODELS,
  type FiscalCompanyType,
} from "@/lib/fiscal/fiscal-matrix";

/**
 * GET /api/gestoria/drafts
 *
 * Lists available fiscal drafts (303, 111, 115) for current and previous quarter.
 * Each draft has a status: ready | pending | not_applicable.
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
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
    const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
    const prevYear = currentQuarter === 1 ? now.getFullYear() - 1 : now.getFullYear();

    // Determine applicable models
    const businessProfile = await (db as any).businessProfile?.findFirst?.();
    const companyType: FiscalCompanyType =
      (businessProfile?.tipoSociedad as FiscalCompanyType) ?? "SL_GENERAL";

    const applicableDeadlines = getUpcomingDeadlines(companyType, 90, now);
    const applicableModels = new Set(applicableDeadlines.map((d) => d.model));

    const draftModels = ["303", "111", "115"];
    const quarters = [
      { quarter: prevQuarter, year: prevYear, label: `T${prevQuarter}-${prevYear}` },
      {
        quarter: currentQuarter,
        year: now.getFullYear(),
        label: `T${currentQuarter}-${now.getFullYear()}`,
      },
    ];

    const drafts = [];

    for (const model of draftModels) {
      const info = FISCAL_MODELS[model];
      if (!info) continue;

      for (const q of quarters) {
        const isApplicable = applicableModels.has(model) || config.manages.includes("fiscal");

        // Check if fiscal model data exists for this period
        const fiscalRecord = await (db as any).fiscalModel303
          ?.findFirst?.({
            where: {
              period: q.label,
            },
          })
          .catch(() => null);

        let status: "ready" | "pending" | "not_applicable" = "not_applicable";
        if (!isApplicable && !config.manages.includes("fiscal")) {
          status = "not_applicable";
        } else if (fiscalRecord) {
          status = "ready";
        } else {
          status = "pending";
        }

        drafts.push({
          model,
          modelName: info.name,
          period: q.label,
          status,
          description: info.description,
        });
      }
    }

    return NextResponse.json({ drafts });
  } catch (err) {
    return errorResponse("Error listing fiscal drafts", err);
  }
});
