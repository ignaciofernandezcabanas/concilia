import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { z } from "zod";
import { generateWCBridge } from "@/lib/reports/wc-bridge";

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

/**
 * GET /api/reports/wc-bridge
 *
 * Returns the Working Capital Bridge report for the authenticated company.
 *
 * Query params:
 *   from - Start date (ISO)
 *   to   - End date (ISO)
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const searchParams = req.nextUrl.searchParams;

  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { from, to } = parsed.data;

  try {
    const report = await generateWCBridge(ctx.db, from, to);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[reports/wc-bridge] Error:", err);
    return errorResponse("Failed to generate working capital bridge.", err, 500);
  }
}, "read:reports");
