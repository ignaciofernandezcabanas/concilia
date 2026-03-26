import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { calculateModelIS } from "@/lib/reports/fiscal-models";
import { z } from "zod";

const schema = z.object({ year: z.coerce.number().int().min(2020).max(2030) });

/**
 * GET /api/reports/fiscal/is?year=2025
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const params = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!params.success) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }
    const result = await calculateModelIS(db, ctx.company.id, params.data.year);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to calculate IS", err);
  }
}, "read:reports");

const patchSchema = z.object({
  year: z.number().int().min(2020).max(2030),
  gastosNoDeducibles: z.number().min(0).optional(),
  ingresosExentos: z.number().min(0).optional(),
});

/**
 * PATCH /api/reports/fiscal/is
 * Persist IS extracontable adjustments.
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

    const { year, gastosNoDeducibles, ingresosExentos } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).fiscalAdjustment.upsert({
      where: { companyId_year: { companyId: ctx.company.id, year } },
      create: {
        year,
        gastosNoDeducibles: gastosNoDeducibles ?? 0,
        ingresosExentos: ingresosExentos ?? 0,
      },
      update: {
        ...(gastosNoDeducibles != null ? { gastosNoDeducibles } : {}),
        ...(ingresosExentos != null ? { ingresosExentos } : {}),
      },
    });

    const result = await calculateModelIS(db, ctx.company.id, year);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to update IS adjustments", err);
  }
}, "manage:settings");
