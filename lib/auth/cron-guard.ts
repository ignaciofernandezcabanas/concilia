/**
 * Cron endpoint protection.
 *
 * Verifies requests come from:
 * 1. Upstash QStash (signature verification) — production
 * 2. CRON_SECRET bearer token — development/manual
 *
 * If neither is configured, rejects all requests (fail-closed).
 */

import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

type CronHandler = (req: NextRequest) => Promise<NextResponse>;

export function withCronAuth(handler: CronHandler): CronHandler {
  return async (req: NextRequest) => {
    // ── Option 1: QStash signature ──
    const qstashToken = process.env.QSTASH_CURRENT_SIGNING_KEY;
    if (qstashToken) {
      try {
        const { Receiver } = await import("@upstash/qstash");
        const receiver = new Receiver({
          currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
          nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
        });

        const signature = req.headers.get("upstash-signature") ?? "";
        const body = await req.text();

        await receiver.verify({ signature, body });

        // Re-create request with body for the handler
        const newReq = new NextRequest(req.url, {
          method: req.method,
          headers: req.headers,
          body,
        });
        return handler(newReq);
      } catch {
        // QStash verification failed — try fallback
      }
    }

    // ── Option 2: CRON_SECRET bearer token ──
    if (CRON_SECRET) {
      const authHeader = req.headers.get("authorization");
      if (authHeader === `Bearer ${CRON_SECRET}`) {
        return handler(req);
      }
    }

    // ── Fail-closed: no valid auth ──
    console.warn("[cron-guard] Unauthorized cron request to", req.url);
    return NextResponse.json(
      { error: "Unauthorized. Provide QStash signature or CRON_SECRET." },
      { status: 401 }
    );
  };
}
