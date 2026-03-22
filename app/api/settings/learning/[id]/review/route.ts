import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { z } from "zod";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "promote"]),
});

/**
 * POST /api/settings/learning/[id]/review
 *
 * Review a learned pattern:
 * - approve → ACTIVE_SUPERVISED (pattern will be applied but logged)
 * - reject → REJECTED (pattern discarded)
 * - promote → PROMOTED (creates a MatchingRule, links via promotedToRuleId)
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const { user, company } = ctx;
    const patternId = ctx.params?.id;

    if (!patternId) {
      return NextResponse.json({ error: "Pattern ID required." }, { status: 400 });
    }

    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const pattern = await prisma.learnedPattern.findFirst({
      where: { id: patternId, companyId: company.id },
    });

    if (!pattern) {
      return NextResponse.json({ error: "Pattern not found." }, { status: 404 });
    }

    switch (parsed.data.action) {
      case "approve": {
        await prisma.learnedPattern.update({
          where: { id: patternId },
          data: {
            status: "ACTIVE_SUPERVISED",
            isActive: true,
            reviewedAt: new Date(),
            reviewedById: user.id,
          },
        });
        return NextResponse.json({ success: true, newStatus: "ACTIVE_SUPERVISED" });
      }

      case "reject": {
        await prisma.learnedPattern.update({
          where: { id: patternId },
          data: {
            status: "REJECTED",
            isActive: false,
            reviewedAt: new Date(),
            reviewedById: user.id,
          },
        });
        return NextResponse.json({ success: true, newStatus: "REJECTED" });
      }

      case "promote": {
        // Create a MatchingRule from this pattern
        const rule = await prisma.matchingRule.create({
          data: {
            name: `Promovida: ${pattern.counterpartName ?? pattern.conceptPattern ?? pattern.type}`,
            type: pattern.counterpartIban ? "IBAN_CLASSIFY" : "CONCEPT_CLASSIFY",
            origin: "PROMOTED",
            status: "ACTIVE",
            isActive: true,
            pattern: pattern.conceptPattern,
            counterpartIban: pattern.counterpartIban,
            counterpartName: pattern.counterpartName,
            accountCode: pattern.predictedAccount,
            action: pattern.predictedAction,
            companyId: company.id,
            createdById: user.id,
          },
        });

        await prisma.learnedPattern.update({
          where: { id: patternId },
          data: {
            status: "PROMOTED",
            isActive: false,
            promotedToRuleId: rule.id,
            reviewedAt: new Date(),
            reviewedById: user.id,
          },
        });

        return NextResponse.json({ success: true, newStatus: "PROMOTED", ruleId: rule.id });
      }
    }
  },
  "manage:rules"
);
