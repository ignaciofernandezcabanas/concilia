import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { companySettingsSchema } from "@/lib/utils/validation";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * GET /api/settings/company
 *
 * Returns the company settings for the authenticated user.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;

    const full = await prisma.company.findUnique({
      where: { id: company.id },
      include: {
        integrations: {
          select: {
            id: true,
            type: true,
            status: true,
            lastSyncAt: true,
            syncFrequency: true,
          },
        },
        _count: {
          select: {
            users: true,
            invoices: true,
            bankTransactions: true,
            matchingRules: true,
            ownBankAccounts: true,
          },
        },
      },
    });

    if (!full) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ company: full });
  },
  "read:dashboard"
);

/**
 * PUT /api/settings/company
 *
 * Updates company settings. Requires ADMIN role.
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { user, company } = ctx;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const parsed = companySettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates = parsed.data;

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(cleanUpdates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update." },
        { status: 400 }
      );
    }

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: cleanUpdates,
    });

    createAuditLog({
      userId: user.id,
      action: "COMPANY_SETTINGS_UPDATED",
      entityType: "Company",
      entityId: company.id,
      details: cleanUpdates,
    }).catch((err) => console.warn("[company] Non-critical operation failed:", err instanceof Error ? err.message : err));

    return NextResponse.json({ company: updated });
  },
  "manage:settings"
);
