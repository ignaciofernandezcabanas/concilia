import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/settings/rules/confirm
 *
 * Creates a MatchingRule from a confirmed structured proposal.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const { company, user } = ctx;
  const body = await req.json();

  const { type, conditions, action, actionDetails } = body;

  if (!type || !action) {
    return NextResponse.json({ error: "type y action son requeridos." }, { status: 400 });
  }

  const rule = await prisma.matchingRule.create({
    data: {
      type: type as never,
      isActive: true,
      pattern: conditions?.conceptPattern ?? null,
      counterpartIban: conditions?.counterpartIban ?? null,
      contactId: conditions?.contactId ?? null,
      minAmount: conditions?.minAmount ?? null,
      maxAmount: conditions?.maxAmount ?? null,
      action,
      accountCode: actionDetails?.accountCode ?? null,
      cashflowType: (actionDetails?.cashflowType as never) ?? null,
      companyId: company.id,
      createdById: user.id,
    },
  });

  createAuditLog({
    userId: user.id,
    action: "RULE_CREATED_NL",
    entityType: "MatchingRule",
    entityId: rule.id,
    details: {
      type,
      conditions,
      action,
      actionDetails,
      source: "natural_language",
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, rule: { id: rule.id, type: rule.type } });
}, "manage:rules");
