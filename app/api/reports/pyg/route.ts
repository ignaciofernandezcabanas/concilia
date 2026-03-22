import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { pygQuerySchema } from "@/lib/utils/validation";
import { generatePyG, type PyGLevel } from "@/lib/reports/pyg-generator";

/**
 * GET /api/reports/pyg
 *
 * Returns the P&L (PyG) report for the authenticated company.
 *
 * Query params:
 *   from          - Start date (ISO)
 *   to            - End date (ISO)
 *   level         - Detail level: 1=results, 2=titles, 3=groups, 4=accounts
 *   includeEbitda - Include EBITDA calculation (default: true)
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;
    const searchParams = req.nextUrl.searchParams;

    const parsed = pygQuerySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { from, to, level, includeEbitda } = parsed.data;

    // Map numeric level to named level
    const levelMap: Record<number, PyGLevel> = {
      1: "results",
      2: "titles",
      3: "groups",
      4: "accounts",
      5: "accounts",
    };
    const namedLevel = levelMap[level] ?? "titles";

    try {
      const report = await generatePyG(
        company.id,
        from,
        to,
        namedLevel,
        includeEbitda
      );

      return NextResponse.json(report);
    } catch (err) {
      console.error("[reports/pyg] Error:", err);
      return errorResponse("Failed to generate P&L report.", err, 500);
    }
  },
  "read:reports"
);
