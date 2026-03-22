import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/utils/audit";
import { parsePagination, paginatedResponse } from "@/lib/utils/pagination";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  type: z.enum([
    "EXACT_AMOUNT_CONTACT",
    "CONCEPT_CLASSIFY",
    "IBAN_CLASSIFY",
    "IBAN_INTERNAL",
    "FINANCIAL_SPLIT",
  ]),
  pattern: z.string().max(500).optional(),
  counterpartIban: z.string().max(34).optional(),
  contactId: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  action: z.string().min(1),
  accountCode: z.string().optional(),
  cashflowType: z
    .enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"])
    .optional(),
});

const deleteRuleSchema = z.object({
  id: z.string().min(1),
});

/**
 * GET /api/settings/rules
 *
 * Lists matching rules for the authenticated company.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;
    const { page, pageSize, skip, take } = parsePagination(
      req.nextUrl.searchParams
    );

    const isActive = req.nextUrl.searchParams.get("isActive");

    const where: { companyId: string; isActive?: boolean } = {
      companyId: company.id,
    };
    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;

    const [data, total] = await Promise.all([
      prisma.matchingRule.findMany({
        where,
        orderBy: [{ timesApplied: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.matchingRule.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(data, total, page, pageSize));
  },
  "manage:rules"
);

/**
 * POST /api/settings/rules
 *
 * Creates a new matching rule.
 */
export const POST = withAuth(
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

    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Validate referenced account if provided
    if (input.accountCode) {
      const account = await prisma.account.findFirst({
        where: { code: input.accountCode, companyId: company.id },
      });
      if (!account) {
        return NextResponse.json(
          { error: `Account ${input.accountCode} not found.` },
          { status: 400 }
        );
      }
    }

    // Validate referenced contact if provided
    if (input.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: input.contactId, companyId: company.id },
      });
      if (!contact) {
        return NextResponse.json(
          { error: "Contact not found." },
          { status: 400 }
        );
      }
    }

    // Validate regex pattern if provided
    if (input.pattern) {
      try {
        new RegExp(input.pattern);
      } catch {
        return NextResponse.json(
          { error: "Invalid regex pattern." },
          { status: 400 }
        );
      }
    }

    const rule = await prisma.matchingRule.create({
      data: {
        companyId: company.id,
        type: input.type as any,
        pattern: input.pattern ?? null,
        counterpartIban: input.counterpartIban ?? null,
        contactId: input.contactId ?? null,
        minAmount: input.minAmount ?? null,
        maxAmount: input.maxAmount ?? null,
        action: input.action,
        accountCode: input.accountCode ?? null,
        cashflowType: input.cashflowType as any ?? null,
        createdById: user.id,
      },
    });

    createAuditLog({
      userId: user.id,
      action: "RULE_CREATED",
      entityType: "MatchingRule",
      entityId: rule.id,
      details: input,
    }).catch((err) => console.warn("[rules] Non-critical operation failed:", err instanceof Error ? err.message : err));

    return NextResponse.json({ success: true, rule }, { status: 201 });
  },
  "manage:rules"
);

/**
 * DELETE /api/settings/rules
 *
 * Deletes a matching rule by ID (passed in request body).
 */
export const DELETE = withAuth(
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

    const parsed = deleteRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = parsed.data;

    // Verify the rule belongs to this company
    const rule = await prisma.matchingRule.findFirst({
      where: { id, companyId: company.id },
    });

    if (!rule) {
      return NextResponse.json(
        { error: "Rule not found." },
        { status: 404 }
      );
    }

    await prisma.matchingRule.delete({ where: { id } });

    createAuditLog({
      userId: user.id,
      action: "RULE_DELETED",
      entityType: "MatchingRule",
      entityId: id,
      details: {
        type: rule.type,
        pattern: rule.pattern,
        action: rule.action,
      },
    }).catch((err) => console.warn("[rules] Non-critical operation failed:", err instanceof Error ? err.message : err));

    return NextResponse.json({ success: true, deletedId: id });
  },
  "manage:rules"
);
