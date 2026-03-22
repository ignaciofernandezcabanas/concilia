import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/cron/daily-sync
 *
 * QStash cron endpoint that runs the daily synchronization pipeline:
 * 1. Sync invoices/contacts from Holded
 * 2. Sync bank transactions from GoCardless
 * 3. Run reconciliation engine
 * 4. Check for overdue invoices
 *
 * Must be called with a valid QStash signature.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify QStash signature
    const signature = req.headers.get("upstash-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "Missing QStash signature." },
        { status: 401 }
      );
    }

    const { Receiver } = await import("@upstash/qstash");
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });

    const body = await req.text();
    try {
      await receiver.verify({ signature, body });
    } catch {
      return NextResponse.json(
        { error: "Invalid QStash signature." },
        { status: 401 }
      );
    }

    // Get all companies with active integrations that need daily sync
    const companies = await prisma.company.findMany({
      where: {
        integrations: {
          some: {
            status: "CONNECTED",
            syncFrequency: "daily",
          },
        },
      },
      select: { id: true, name: true },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const results: {
      companyId: string;
      companyName: string;
      steps: { step: string; success: boolean; error?: string }[];
    }[] = [];

    for (const company of companies) {
      const steps: { step: string; success: boolean; error?: string }[] = [];

      // Step 1: Sync Holded
      try {
        const holdedResp = await fetch(`${baseUrl}/api/sync/holded`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "upstash-signature": signature,
          },
          body: JSON.stringify({ companyId: company.id }),
        });
        const holdedResult = await holdedResp.json();
        steps.push({
          step: "holded_sync",
          success: holdedResp.ok,
          error: holdedResp.ok ? undefined : holdedResult.error,
        });
      } catch (err) {
        steps.push({
          step: "holded_sync",
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 2: Sync bank
      try {
        const bankResp = await fetch(`${baseUrl}/api/sync/bank`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "upstash-signature": signature,
          },
          body: JSON.stringify({ companyId: company.id }),
        });
        const bankResult = await bankResp.json();
        steps.push({
          step: "bank_sync",
          success: bankResp.ok,
          error: bankResp.ok ? undefined : bankResult.error,
        });
      } catch (err) {
        steps.push({
          step: "bank_sync",
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 3: Overdue check
      try {
        const overdueResp = await fetch(
          `${baseUrl}/api/cron/overdue-check`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "upstash-signature": signature,
            },
            body: JSON.stringify({ companyId: company.id }),
          }
        );
        const overdueResult = await overdueResp.json();
        steps.push({
          step: "overdue_check",
          success: overdueResp.ok,
          error: overdueResp.ok ? undefined : overdueResult.error,
        });
      } catch (err) {
        steps.push({
          step: "overdue_check",
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      results.push({
        companyId: company.id,
        companyName: company.name,
        steps,
      });
    }

    return NextResponse.json({
      success: true,
      companiesProcessed: companies.length,
      results,
    });
  } catch (err) {
    console.error("[cron/daily-sync] Error:", err);
    return NextResponse.json(
      {
        error: "Daily sync cron failed.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
