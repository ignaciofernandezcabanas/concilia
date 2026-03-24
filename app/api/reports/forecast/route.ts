import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateForecast } from "@/lib/reports/forecast-generator";

/**
 * GET /api/reports/forecast?weeks=12
 *
 * Treasury forecast for the next N weeks (default 12 = 3 months).
 * Projects cash position based on pending invoices, recurring patterns, and current balance.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const weeksParam = req.nextUrl.searchParams.get("weeks");
  const weeks = Math.min(52, Math.max(4, parseInt(weeksParam || "12")));

  try {
    const report = await generateForecast(ctx.db, weeks);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[reports/forecast] Error:", err);
    return NextResponse.json({ error: "Failed to generate forecast." }, { status: 500 });
  }
}, "read:reports");
