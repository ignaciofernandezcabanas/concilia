import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";

/**
 * GET /api/agent-runs?page=1&limit=20
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const company = await prisma.company.findUnique({
      where: { id: ctx.company.id },
      select: { organizationId: true },
    });

    if (!company?.organizationId) {
      return NextResponse.json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    }

    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where = { organizationId: company.organizationId };

    const [data, total] = await Promise.all([
      prisma.agentRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          companiesProcessed: true,
          txsProcessed: true,
          txsAutoExecuted: true,
          txsToBandeja: true,
          llmCallsTotal: true,
          llmCostEstimate: true,
          errorsCount: true,
        },
      }),
      prisma.agentRun.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
  "read:dashboard"
);
