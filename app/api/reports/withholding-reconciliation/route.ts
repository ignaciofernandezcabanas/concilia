import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { generateWithholdingReconciliation } from "@/lib/reports/withholding-reconciliation";

/**
 * GET /api/reports/withholding-reconciliation?quarter=1&year=2026&modelo=111
 *
 * Compares theoretical withholdings (from received invoices) with actual
 * bank payments to AEAT for Modelo 111 (IRPF) or 115 (rent).
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const quarterStr = req.nextUrl.searchParams.get("quarter");
  const yearStr = req.nextUrl.searchParams.get("year");
  const modelo = req.nextUrl.searchParams.get("modelo") ?? "111";

  if (!quarterStr || !yearStr) {
    return NextResponse.json(
      { error: 'Query parameters "quarter" (1-4) and "year" are required.' },
      { status: 400 }
    );
  }

  const quarter = parseInt(quarterStr, 10);
  const year = parseInt(yearStr, 10);

  if (quarter < 1 || quarter > 4 || isNaN(quarter)) {
    return NextResponse.json({ error: "Quarter must be between 1 and 4." }, { status: 400 });
  }
  if (year < 2000 || year > 2100 || isNaN(year)) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }
  if (modelo !== "111" && modelo !== "115") {
    return NextResponse.json({ error: 'Modelo must be "111" or "115".' }, { status: 400 });
  }

  try {
    const report = await generateWithholdingReconciliation(db, quarter, year, modelo);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[reports/withholding-reconciliation] Error:", err);
    return errorResponse("Failed to generate withholding reconciliation report.", err, 500);
  }
}, "read:reports");
