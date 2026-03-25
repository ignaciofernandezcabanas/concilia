import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { generateDebtPosition } from "@/lib/reports/debt-position";

// ---------------------------------------------------------------------------
// GET /api/debt-instruments/summary
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const summary = await generateDebtPosition(ctx.db);
    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse("Failed to generate debt summary", err);
  }
});
