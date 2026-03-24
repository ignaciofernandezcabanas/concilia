import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { generateVatReconciliation } from "@/lib/reports/vat-reconciliation";

/**
 * GET /api/reports/vat-reconciliation?quarter=1&year=2026
 *
 * Compares theoretical VAT (Modelo 303) with actual bank payments to AEAT.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const quarterStr = req.nextUrl.searchParams.get("quarter");
  const yearStr = req.nextUrl.searchParams.get("year");

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

  try {
    const report = await generateVatReconciliation(db, quarter, year);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[reports/vat-reconciliation] Error:", err);
    return errorResponse("Failed to generate VAT reconciliation report.", err, 500);
  }
}, "read:reports");
