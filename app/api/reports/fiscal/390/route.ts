import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { calculateModel390 } from "@/lib/reports/fiscal-models";

/**
 * GET /api/reports/fiscal/390?year=2026
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const yearStr = req.nextUrl.searchParams.get("year");
    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const result = await calculateModel390(ctx.db, ctx.company.id, year);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to calculate Model 390", err);
  }
}, "read:reports");
