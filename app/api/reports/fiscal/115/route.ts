import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { calculateModel115 } from "@/lib/reports/fiscal-models";

/**
 * GET /api/reports/fiscal/115?from=2026-01-01&to=2026-03-31
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        { error: "Query parameters 'from' and 'to' are required." },
        { status: 400 }
      );
    }

    const result = await calculateModel115(ctx.db, ctx.company.id, new Date(from), new Date(to));
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to calculate Model 115", err);
  }
}, "read:reports");
