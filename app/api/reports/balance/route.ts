import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateBalance } from "@/lib/reports/balance-generator";

/**
 * GET /api/reports/balance?asOf=2026-03-31
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const asOfParam = req.nextUrl.searchParams.get("asOf");
  if (!asOfParam) {
    return NextResponse.json(
      { error: 'Query parameter "asOf" is required (YYYY-MM-DD).' },
      { status: 400 }
    );
  }

  const asOf = new Date(asOfParam);
  if (isNaN(asOf.getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  try {
    const report = await generateBalance(ctx.db, asOf);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[reports/balance] Error:", err);
    return errorResponse("Failed to generate balance.", err, 500);
  }
}, "read:reports");
