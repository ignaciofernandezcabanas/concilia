import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cron creates scoped db per company
import { withCronAuth } from "@/lib/auth/cron-guard";

/**
 * POST /api/cron/daily-sync
 *
 * Protected by QStash signature or CRON_SECRET.
 */
export const POST = withCronAuth(async (_req: NextRequest) => {
  try {
    const companies = await prisma.company.findMany({
      where: {
        integrations: {
          some: { status: "CONNECTED", syncFrequency: "daily" },
        },
      },
      select: { id: true, name: true },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const cronSecret = process.env.CRON_SECRET;
    const authHeader: Record<string, string> = cronSecret
      ? { Authorization: `Bearer ${cronSecret}` }
      : {};

    const results: {
      companyId: string;
      steps: { step: string; success: boolean; error?: string }[];
    }[] = [];

    for (const company of companies) {
      const steps: { step: string; success: boolean; error?: string }[] = [];

      for (const [step, url] of [
        ["holded_sync", `${baseUrl}/api/sync/holded`],
        ["overdue_check", `${baseUrl}/api/cron/overdue-check`],
      ] as const) {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ companyId: company.id }),
          });
          steps.push({
            step,
            success: resp.ok,
            error: resp.ok ? undefined : (await resp.json().catch(() => ({}))).error,
          });
        } catch (err) {
          steps.push({
            step,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      results.push({ companyId: company.id, steps });
    }

    return NextResponse.json({ success: true, companiesProcessed: companies.length, results });
  } catch (err) {
    console.error("[cron/daily-sync] Error:", err);
    return errorResponse("Daily sync failed.", err, 500);
  }
});
