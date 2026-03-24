import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { GmailClient } from "@/lib/gmail/client";
import { z } from "zod";

const accountSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
});

const updateSchema = z.object({
  accounts: z.array(accountSchema).min(1, "Al menos una cuenta es requerida"),
});

/**
 * GET /api/integrations/gmail
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const integration = await db.integration.findFirst({
    where: { companyId: ctx.company.id, type: "GOOGLE_DRIVE" },
  });

  const config = (integration?.config as Record<string, unknown>) ?? {};
  const gmailAccounts = (config.gmailAccounts as { email: string }[]) ?? [];

  return NextResponse.json({
    integration: {
      status: gmailAccounts.length > 0 ? "CONNECTED" : "DISCONNECTED",
      accounts: gmailAccounts.map((a) => ({ email: a.email })),
    },
  });
}, "read:dashboard");

/**
 * PUT /api/integrations/gmail
 * Connect multiple Gmail accounts for read-only invoice scanning.
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

  // Verify each account
  const verifiedAccounts: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    email: string;
  }[] = [];
  for (const acct of parsed.data.accounts) {
    try {
      const gmail = new GmailClient(acct);
      const profile = await gmail.getProfile();
      verifiedAccounts.push({ ...acct, email: profile.email });
    } catch {
      return NextResponse.json(
        { error: `No se pudo conectar la cuenta con client ID ${acct.clientId.slice(0, 10)}...` },
        { status: 400 }
      );
    }
  }

  const existing = await db.integration.findUnique({
    where: { type_companyId: { type: "GOOGLE_DRIVE", companyId: ctx.company.id } },
  });
  const existingConfig = (existing?.config as Record<string, unknown>) ?? {};

  await db.integration.upsert({
    where: { type_companyId: { type: "GOOGLE_DRIVE", companyId: ctx.company.id } },
    create: {
      type: "GOOGLE_DRIVE",
      status: "CONNECTED",
      config: { ...existingConfig, gmailAccounts: verifiedAccounts },
      syncFrequency: "manual",
      companyId: ctx.company.id,
    },
    update: {
      config: { ...existingConfig, gmailAccounts: verifiedAccounts },
    },
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: "INTEGRATION_GMAIL_CONNECTED",
    entityType: "Integration",
    entityId: existing?.id ?? "new",
    details: { emails: verifiedAccounts.map((a) => a.email), mode: "read_only" },
  }).catch((err) =>
    console.warn("[gmail] Non-critical operation failed:", err instanceof Error ? err.message : err)
  );

  return NextResponse.json({
    success: true,
    accounts: verifiedAccounts.map((a) => ({ email: a.email })),
  });
}, "manage:integrations");
