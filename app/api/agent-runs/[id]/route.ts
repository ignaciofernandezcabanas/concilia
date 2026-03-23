import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/agent-runs/[id]
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const company = await db.company.findUnique({
      where: { id: ctx.company.id },
      select: { organizationId: true },
    });

    const run = await db.agentRun.findFirst({
      where: { id, organizationId: company?.organizationId ?? "" },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    return NextResponse.json({ run });
  },
  "read:dashboard"
);
