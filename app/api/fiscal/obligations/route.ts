import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const querySchema = z.object({ year: z.coerce.number().int().min(2020).max(2040) });

/**
 * GET /api/fiscal/obligations?year=2026
 * Returns fiscal obligation records (presentedAt status) for the given year.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const params = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!params.success) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obligations = await (db as any).fiscalObligation.findMany({
      where: { year: params.data.year },
    });

    return NextResponse.json(obligations);
  } catch (err) {
    return errorResponse("Failed to fetch fiscal obligations", err);
  }
}, "read:reports");

const patchSchema = z.object({
  model: z.string().min(1),
  quarter: z.number().int().min(1).max(4).nullable(),
  year: z.number().int().min(2020).max(2040),
  presentedAt: z.string().datetime().nullable(),
});

/**
 * PATCH /api/fiscal/obligations
 * Upsert a fiscal obligation to mark it as presented (or un-mark).
 */
export const PATCH = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos no válidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { model, quarter, year, presentedAt } = parsed.data;
    const companyId = ctx.company.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obligation = await (db as any).fiscalObligation.upsert({
      where: {
        companyId_model_quarter_year: { companyId, model, quarter, year },
      },
      create: {
        model,
        quarter,
        year,
        presentedAt: presentedAt ? new Date(presentedAt) : null,
      },
      update: {
        presentedAt: presentedAt ? new Date(presentedAt) : null,
      },
    });

    return NextResponse.json(obligation);
  } catch (err) {
    return errorResponse("Failed to update fiscal obligation", err);
  }
}, "manage:settings");
