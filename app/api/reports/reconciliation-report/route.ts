import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateReconciliationReport } from "@/lib/reports/reconciliation-report";

/**
 * GET /api/reports/reconciliation-report
 *
 * Returns the reconciliation report comparing Holded (accrual) vs bank (cash).
 *
 * Query params:
 *   month - Period in "YYYY-MM" format (e.g. "2026-03")
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const month = req.nextUrl.searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      {
        error: 'Query parameter "month" is required in YYYY-MM format (e.g. "2026-03").',
      },
      { status: 400 }
    );
  }

  // Validate month range
  const [year, monthNum] = month.split("-").map(Number);
  if (monthNum < 1 || monthNum > 12 || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid month value." }, { status: 400 });
  }

  try {
    const report = await generateReconciliationReport(db, month);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[reports/reconciliation-report] Error:", err);
    return errorResponse("Failed to generate reconciliation report.", err, 500);
  }
}, "read:reports");
