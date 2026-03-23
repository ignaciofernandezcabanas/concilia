import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { cashflowQuerySchema } from "@/lib/utils/validation";
import { generateCashflow, type CashflowMode } from "@/lib/reports/cashflow-generator";

/**
 * GET /api/reports/cashflow
 *
 * Returns the cash flow report for the authenticated company.
 *
 * Query params:
 *   from - Start date (ISO)
 *   to   - End date (ISO)
 *   mode - "direct" (treasury) or "indirect" (EFE). Default: "direct".
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;
    const searchParams = req.nextUrl.searchParams;

    const parsed = cashflowQuerySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { from, to, mode } = parsed.data;

    try {
      const report = await generateCashflow(
        ctx.db,
        from,
        to,
        mode as CashflowMode
      );

      return NextResponse.json(report);
    } catch (err) {
      console.error("[reports/cashflow] Error:", err);
      return errorResponse("Failed to generate cash flow report.", err, 500);
    }
  },
  "read:reports"
);
