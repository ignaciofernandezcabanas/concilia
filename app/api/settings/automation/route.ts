import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { z } from "zod";

/**
 * GET /api/settings/automation
 *
 * Returns automation config + stats for the last 30 days.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const company = await db.company.findUnique({
    where: { id: ctx.company.id },
    select: { organizationId: true },
  });

  if (!company?.organizationId) {
    return NextResponse.json({ error: "No organization." }, { status: 400 });
  }

  const org = await db.organization.findUnique({
    where: { id: company.organizationId },
    select: { id: true, autoExecuteThreshold: true },
  });

  // Stats from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const runs = await db.agentRun.findMany({
    where: {
      organizationId: company.organizationId,
      startedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { startedAt: "desc" },
    take: 30,
  });

  const totals = runs.reduce(
    (acc, r) => ({
      txsProcessed: acc.txsProcessed + r.txsProcessed,
      txsAutoExecuted: acc.txsAutoExecuted + r.txsAutoExecuted,
      txsToBandeja: acc.txsToBandeja + r.txsToBandeja,
      llmCallsTotal: acc.llmCallsTotal + r.llmCallsTotal,
      llmCostEstimate: acc.llmCostEstimate + r.llmCostEstimate,
      errorsCount: acc.errorsCount + r.errorsCount,
    }),
    {
      txsProcessed: 0,
      txsAutoExecuted: 0,
      txsToBandeja: 0,
      llmCallsTotal: 0,
      llmCostEstimate: 0,
      errorsCount: 0,
    }
  );

  const automationRate =
    totals.txsProcessed > 0 ? Math.round((totals.txsAutoExecuted / totals.txsProcessed) * 100) : 0;

  return NextResponse.json({
    config: {
      autoExecuteThreshold: org?.autoExecuteThreshold ?? 0.95,
      organizationId: company.organizationId,
    },
    stats30d: {
      ...totals,
      automationRate,
      runsCount: runs.length,
      llmCostEstimate: Math.round(totals.llmCostEstimate * 100) / 100,
    },
  });
}, "read:dashboard");

const updateSchema = z.object({
  autoExecuteThreshold: z.number().min(0.8).max(0.99).optional(),
});

/**
 * PUT /api/settings/automation
 *
 * Update automation config (threshold).
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const company = await db.company.findUnique({
    where: { id: ctx.company.id },
    select: { organizationId: true },
  });

  if (!company?.organizationId) {
    return NextResponse.json({ error: "No organization." }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.autoExecuteThreshold != null) {
    await db.organization.update({
      where: { id: company.organizationId },
      data: { autoExecuteThreshold: parsed.data.autoExecuteThreshold },
    });
  }

  return NextResponse.json({ success: true });
}, "manage:settings");
