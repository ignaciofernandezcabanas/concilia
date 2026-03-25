/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/gestoria/config
 *
 * Returns the gestoría configuration for the current company.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;
    const config = await (db as any).gestoriaConfig?.findFirst?.();
    return NextResponse.json({ config: config ?? null });
  } catch (err) {
    return errorResponse("Error loading gestoría config", err);
  }
});

/**
 * PUT /api/gestoria/config
 *
 * Creates or updates the gestoría configuration.
 */
const configSchema = z.object({
  gestoriaName: z.string().max(200).optional(),
  contactName: z.string().max(200).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  accessLevel: z.enum(["subir_docs", "reportes", "completo"]).optional(),
  manages: z.array(z.enum(["fiscal", "laboral", "mercantil", "contable"])).optional(),
});

export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;
    const body = await req.json();
    const parsed = configSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const existing = await (db as any).gestoriaConfig?.findFirst?.();

    let config;
    if (existing) {
      config = await (db as any).gestoriaConfig.update({
        where: { id: existing.id },
        data: parsed.data,
      });
    } else {
      config = await (db as any).gestoriaConfig.create({
        data: {
          ...parsed.data,
          companyId: ctx.company.id,
        },
      });
    }

    return NextResponse.json({ config });
  } catch (err) {
    return errorResponse("Error saving gestoría config", err);
  }
});
