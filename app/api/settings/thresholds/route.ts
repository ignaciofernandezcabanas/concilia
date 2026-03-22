import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CATEGORIES = ["EXACT_MATCH", "GROUPED_MATCH", "DIFFERENCE_MATCH", "PARTIAL_MATCH", "CLASSIFICATION"];

/**
 * GET /api/settings/thresholds
 * Returns per-category thresholds + global fallback.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const { company } = ctx;

  const categoryThresholds = await prisma.categoryThreshold.findMany({
    where: { companyId: company.id },
  });

  const result = CATEGORIES.map((cat) => {
    const ct = categoryThresholds.find((t) => t.category === cat);
    return {
      category: cat,
      threshold: ct?.threshold ?? company.autoApproveThreshold,
      isCustom: !!ct,
    };
  });

  return NextResponse.json({
    global: company.autoApproveThreshold,
    categories: result,
  });
}, "read:dashboard");

/**
 * PUT /api/settings/thresholds
 * Update a per-category threshold.
 * Body: { category: string, threshold: number } or { category: string, reset: true }
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const { company } = ctx;
  const body = await req.json();

  const schema = z.object({
    category: z.enum(CATEGORIES as [string, ...string[]]),
    threshold: z.number().min(0.50).max(0.99).optional(),
    reset: z.boolean().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.reset) {
    await prisma.categoryThreshold.deleteMany({
      where: { companyId: company.id, category: parsed.data.category },
    });
    return NextResponse.json({ success: true, threshold: company.autoApproveThreshold, isCustom: false });
  }

  if (parsed.data.threshold == null) {
    return NextResponse.json({ error: "threshold or reset required." }, { status: 400 });
  }

  const ct = await prisma.categoryThreshold.upsert({
    where: {
      companyId_category: { companyId: company.id, category: parsed.data.category },
    },
    create: { companyId: company.id, category: parsed.data.category, threshold: parsed.data.threshold },
    update: { threshold: parsed.data.threshold },
  });

  return NextResponse.json({ success: true, threshold: ct.threshold, isCustom: true });
}, "manage:settings");
