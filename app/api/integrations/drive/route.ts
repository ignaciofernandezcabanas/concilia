import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { z } from "zod";
import { google } from "googleapis";

const updateSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  rootFolderId: z.string().optional(),
  separateIssuedReceived: z.boolean().default(true),
  folderFormat: z.enum(["YYYY-QN", "YYYY-N"]).default("YYYY-QN"),
});

/**
 * GET /api/integrations/drive
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  const integration = await db.integration.findUnique({
    where: {
      type_companyId: { type: "GOOGLE_DRIVE", companyId: ctx.company.id },
    },
  });

  const config = (integration?.config as Record<string, unknown>) ?? {};

  return NextResponse.json({
    integration: integration
      ? {
          id: integration.id,
          status: integration.status,
          lastSyncAt: integration.lastSyncAt,
          syncFrequency: integration.syncFrequency,
          hasCredentials: !!config.clientId,
          rootFolderId: config.rootFolderId ?? null,
          separateIssuedReceived: config.separateIssuedReceived ?? true,
          folderFormat: config.folderFormat ?? "YYYY-QN",
          error: integration.error,
        }
      : null,
  });
}, "read:dashboard");

/**
 * PUT /api/integrations/drive
 * Connect or update Google Drive integration.
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

  const { clientId, clientSecret, refreshToken, rootFolderId, separateIssuedReceived, folderFormat } = parsed.data;

  // Verify credentials by listing Drive root
  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });
    await drive.files.list({ pageSize: 1 });
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con Google Drive. Verifica las credenciales." },
      { status: 400 }
    );
  }

  const integration = await db.integration.upsert({
    where: {
      type_companyId: { type: "GOOGLE_DRIVE", companyId: ctx.company.id },
    },
    create: {
      type: "GOOGLE_DRIVE",
      status: "CONNECTED",
      config: { clientId, clientSecret, refreshToken, rootFolderId, separateIssuedReceived, folderFormat },
      syncFrequency: "manual",
      companyId: ctx.company.id,
    },
    update: {
      status: "CONNECTED",
      config: { clientId, clientSecret, refreshToken, rootFolderId, separateIssuedReceived, folderFormat },
      error: null,
    },
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: "INTEGRATION_DRIVE_CONNECTED",
    entityType: "Integration",
    entityId: integration.id,
    details: {},
  }).catch((err) => console.warn("[drive] Non-critical operation failed:", err instanceof Error ? err.message : err));

  return NextResponse.json({ success: true, integration: { id: integration.id, status: integration.status } });
}, "manage:integrations");

/**
 * DELETE /api/integrations/drive
 */
export const DELETE = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
  await db.integration.updateMany({
    where: { type: "GOOGLE_DRIVE", companyId: ctx.company.id },
    data: { status: "DISCONNECTED", config: {}, error: null },
  });
  return NextResponse.json({ success: true });
}, "manage:integrations");
