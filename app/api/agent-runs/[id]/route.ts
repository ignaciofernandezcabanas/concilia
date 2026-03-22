import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";

/**
 * GET /api/agent-runs/[id]
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const company = await prisma.company.findUnique({
      where: { id: ctx.company.id },
      select: { organizationId: true },
    });

    const run = await prisma.agentRun.findFirst({
      where: { id, organizationId: company?.organizationId ?? "" },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    return NextResponse.json({ run });
  },
  "read:dashboard"
);
