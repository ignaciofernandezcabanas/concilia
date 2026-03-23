import { NextRequest, NextResponse } from "next/server";
import { withCronAuth } from "@/lib/auth/cron-guard";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cron creates scoped db per company
import { runDailyAgent } from "@/lib/ai/daily-agent";

/**
 * POST /api/cron/daily-agent
 *
 * Runs the daily AI agent for all organizations.
 * Protected by cron auth (QStash or CRON_SECRET).
 */
export const POST = withCronAuth(async (_req: NextRequest) => {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  const results = [];

  for (const org of orgs) {
    try {
      const summary = await runDailyAgent(org.id);
      results.push({ orgId: org.id, orgName: org.name, ...summary });
    } catch (err) {
      results.push({
        orgId: org.id,
        orgName: org.name,
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    organizationsProcessed: orgs.length,
    results,
  });
});
