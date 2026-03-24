import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/settings/automation/learning
 *
 * Returns learning metrics: decisions, approval rate, top patterns, errors, pauses.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const companyId = ctx.company.id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Total decisions
  const totalDecisions = await db.controllerDecision.count({
    where: { companyId },
  });

  // Last 30 days
  const recent = await db.controllerDecision.findMany({
    where: { companyId, createdAt: { gte: thirtyDaysAgo } },
    select: { wasModified: true, controllerAction: true },
  });

  const approvedUnchanged = recent.filter((d) => !d.wasModified).length;
  const corrected = recent.filter((d) => d.wasModified).length;
  const approvalRate =
    recent.length > 0 ? Math.round((approvedUnchanged / recent.length) * 100) : 0;

  // Top positive adjustments (patterns that are performing well)
  const topPatterns = await db.confidenceAdjustment.findMany({
    where: { companyId, adjustment: { gt: 0 } },
    orderBy: { adjustment: "desc" },
    take: 10,
    select: { category: true, patternKey: true, adjustment: true, errors30d: true },
  });

  // Recent errors (negative adjustments)
  const recentErrors = await db.confidenceAdjustment.findMany({
    where: { companyId, errors30d: { gt: 0 } },
    orderBy: { lastErrorAt: "desc" },
    take: 10,
    select: {
      category: true,
      patternKey: true,
      adjustment: true,
      errors30d: true,
      lastErrorAt: true,
    },
  });

  // Paused categories
  const pausedCategories = await db.confidenceAdjustment.findMany({
    where: { companyId, pausedUntil: { gt: new Date() } },
    select: { category: true, patternKey: true, pausedUntil: true },
  });

  return NextResponse.json({
    totalDecisions,
    last30d: {
      total: recent.length,
      approvedUnchanged,
      corrected,
      approvalRate,
    },
    topPatterns,
    recentErrors,
    pausedCategories,
  });
}, "read:dashboard");
