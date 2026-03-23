import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { z } from "zod";

const updateSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  syncFrequency: z.enum(["hourly", "6h", "daily", "manual"]).default("daily"),
});

/**
 * GET /api/integrations/holded
 * Returns Holded integration config for the company.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const integration = await db.integration.findUnique({
    where: {
      type_companyId: { type: "HOLDED", companyId: ctx.company.id },
    },
  });

  return NextResponse.json({
    integration: integration
      ? {
          id: integration.id,
          status: integration.status,
          lastSyncAt: integration.lastSyncAt,
          syncFrequency: integration.syncFrequency,
          hasApiKey: !!(integration.config as Record<string, string>)?.apiKey,
          error: integration.error,
        }
      : null,
  });
}, "read:dashboard");

/**
 * PUT /api/integrations/holded
 * Connect or update Holded integration.
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { apiKey, syncFrequency } = parsed.data;

  // Verify API key by making a test call
  try {
    const res = await fetch("https://api.holded.com/api/invoicing/v1/contacts?limit=1", {
      headers: { key: apiKey },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `API key inválida. Holded respondió con ${res.status}.` },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con Holded." },
      { status: 502 }
    );
  }

  const integration = await db.integration.upsert({
    where: {
      type_companyId: { type: "HOLDED", companyId: ctx.company.id },
    },
    create: {
      type: "HOLDED",
      status: "CONNECTED",
      config: { apiKey },
      syncFrequency,
      companyId: ctx.company.id,
    },
    update: {
      status: "CONNECTED",
      config: { apiKey },
      syncFrequency,
      error: null,
    },
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: "INTEGRATION_HOLDED_CONNECTED",
    entityType: "Integration",
    entityId: integration.id,
    details: { syncFrequency },
  }).catch((err) => console.warn("[holded] Non-critical operation failed:", err instanceof Error ? err.message : err));

  return NextResponse.json({ success: true, integration: { id: integration.id, status: integration.status } });
}, "manage:integrations");

/**
 * DELETE /api/integrations/holded
 * Disconnect Holded integration.
 */
export const DELETE = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  await db.integration.updateMany({
    where: { type: "HOLDED", companyId: ctx.company.id },
    data: { status: "DISCONNECTED", config: {}, error: null },
  });

  return NextResponse.json({ success: true });
}, "manage:integrations");
