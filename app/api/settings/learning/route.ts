import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/settings/learning
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const { company } = ctx;

  const [patterns, rules, calibrations, totalDecisions, acceptedDecisions] = await Promise.all([
    db.learnedPattern.findMany({
      where: { companyId: company.id },
      orderBy: { occurrences: "desc" },
      take: 50,
    }),
    db.matchingRule.findMany({
      where: { companyId: company.id },
      orderBy: { timesApplied: "desc" },
      take: 50,
    }),
    db.thresholdCalibration.findMany({
      where: { companyId: company.id },
      orderBy: { period: "desc" },
      take: 20,
    }),
    db.controllerDecision.count({
      where: { companyId: company.id, isDefinitive: true },
    }),
    db.controllerDecision.count({
      where: { companyId: company.id, isDefinitive: true, wasModified: false },
    }),
  ]);

  const modified = totalDecisions - acceptedDecisions;
  const acceptanceRate = totalDecisions > 0 ? acceptedDecisions / totalDecisions : null;

  return NextResponse.json({
    patterns,
    rules,
    calibrations,
    stats: { totalDecisions, acceptedUnchanged: acceptedDecisions, modified, acceptanceRate },
  });
}, "read:dashboard");

/**
 * POST /api/settings/learning
 * Actions: deactivate, delete
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const { company } = ctx;
  const body = await req.json();

  if (body.action === "deactivate") {
    if (body.type === "pattern") {
      await db.learnedPattern.updateMany({
        where: { id: body.id, companyId: company.id },
        data: { isActive: false },
      });
    } else if (body.type === "rule") {
      await db.matchingRule.updateMany({
        where: { id: body.id, companyId: company.id },
        data: { isActive: false },
      });
    }
  } else if (body.action === "activate") {
    if (body.type === "rule") {
      await db.matchingRule.updateMany({
        where: { id: body.id, companyId: company.id },
        data: { isActive: true, status: "ACTIVE" },
      });
    } else if (body.type === "pattern") {
      await db.learnedPattern.updateMany({
        where: { id: body.id, companyId: company.id },
        data: { isActive: true },
      });
    }
  } else if (body.action === "delete") {
    if (body.type === "pattern") {
      await db.learnedPattern.deleteMany({
        where: { id: body.id, companyId: company.id },
      });
    } else if (body.type === "rule") {
      await db.matchingRule.deleteMany({
        where: { id: body.id, companyId: company.id },
      });
    }
  }

  return NextResponse.json({ success: true });
}, "manage:rules");
