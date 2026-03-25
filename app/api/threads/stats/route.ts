/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/threads/stats — Counts by status and scenario
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const [byStatus, byScenario, total] = await Promise.all([
      (db as any).agentThread.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      (db as any).agentThread.groupBy({
        by: ["scenario"],
        _count: { id: true },
      }),
      (db as any).agentThread.count(),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) {
      statusCounts[row.status] = row._count.id;
    }

    const scenarioCounts: Record<string, number> = {};
    for (const row of byScenario) {
      scenarioCounts[row.scenario] = row._count.id;
    }

    return NextResponse.json({
      data: { total, byStatus: statusCounts, byScenario: scenarioCounts },
    });
  } catch (err) {
    return errorResponse("Failed to get thread stats", err);
  }
});
