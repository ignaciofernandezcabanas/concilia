/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

/**
 * GET /api/follow-up-config — Get company follow-up config
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const config = await (db as any).followUpConfig.findFirst();
    return NextResponse.json({ data: config });
  } catch (err) {
    return errorResponse("Failed to get follow-up config", err);
  }
});

const updateSchema = z.object({
  defaultIntervalDays: z.number().min(1).max(30).optional(),
  defaultMaxAttempts: z.number().min(1).max(10).optional(),
  defaultToneProgression: z.array(z.string()).optional(),
  autoResolveEnabled: z.boolean().optional(),
  staleDays: z.number().min(1).max(60).optional(),
  scenarioDefaults: z.record(z.string(), z.unknown()).optional(),
});

/**
 * PUT /api/follow-up-config — Update company follow-up config
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await (db as any).followUpConfig.findFirst();

    if (existing) {
      const updated = await (db as any).followUpConfig.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      return NextResponse.json({ data: updated });
    }

    const created = await (db as any).followUpConfig.create({
      data: parsed.data,
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to update follow-up config", err);
  }
});
