import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkCapitalAdequacy } from "@/lib/accounting/capital-adequacy";

/**
 * GET /api/accounting/capital-adequacy
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const result = await checkCapitalAdequacy(ctx.db);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to check capital adequacy", err);
  }
}, "read:reports");
