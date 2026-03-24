/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { getFiscalCalendar } from "@/lib/reports/fiscal-models";

/**
 * GET /api/reports/fiscal/calendar?year=2026
 */
export const GET = withAuth(async (req: NextRequest, _ctx: AuthContext) => {
  try {
    const yearStr = req.nextUrl.searchParams.get("year");
    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const deadlines = getFiscalCalendar(year);
    return NextResponse.json({ year, deadlines });
  } catch (err) {
    return errorResponse("Failed to get fiscal calendar", err);
  }
}, "read:reports");
