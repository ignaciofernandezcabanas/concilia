/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/threads — List AgentThreads with filters
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const scenario = sp.get("scenario");
    const priority = sp.get("priority");
    const search = sp.get("search");
    const page = parseInt(sp.get("page") ?? "1");
    const pageSize = parseInt(sp.get("pageSize") ?? "25");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (scenario) where.scenario = scenario;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { externalName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      (db as any).agentThread.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
        },
        orderBy: [{ priority: "desc" }, { lastActivityAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (db as any).agentThread.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    return errorResponse("Failed to list threads", err);
  }
});
