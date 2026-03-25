/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { callAIJson } from "@/lib/ai/model-router";
import { ONBOARDING_INFERENCE } from "@/lib/ai/prompt-registry";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const InferInputSchema = z.object({
  empresa: z.string().min(1),
  nif: z.string().min(1),
  forma_juridica: z.string().min(1),
  sector: z.string().min(1),
  regimen_iva: z.string().min(1),
  irpf_retenciones: z.boolean(),
  actividad: z.string().min(1),
  canales: z.array(z.string()).min(1),
  cobro: z.string().min(1),
});

/**
 * POST /api/setup/business-profile/infer
 *
 * Infer PGC subplan, fiscal modules, and default counterparts from business profile.
 * Creates or updates BusinessProfile. Sets Company.needsBusinessProfile = false.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const { company } = ctx;

  try {
    const body = await req.json();
    const parsed = InferInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos incompletos.", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Call AI for inference
    const result = await callAIJson(
      ONBOARDING_INFERENCE.task,
      ONBOARDING_INFERENCE.system,
      ONBOARDING_INFERENCE.buildUser(input),
      ONBOARDING_INFERENCE.schema
    );

    if (!result) {
      return NextResponse.json(
        { error: "No se pudo inferir el plan de cuentas. Inténtalo de nuevo." },
        { status: 500 }
      );
    }

    // Upsert BusinessProfile
    const existing = await (db as any).businessProfile.findUnique({
      where: { companyId: company.id },
    });

    if (existing) {
      await (db as any).businessProfile.update({
        where: { companyId: company.id },
        data: {
          sector: input.sector,
          actividad: input.actividad,
          canales: input.canales,
          regimenIva: input.regimen_iva,
          modeloIngreso: input.cobro,
          subplanPGC: result,
          modulosFiscales: result.fiscal_modules.map((m) => m.model),
          inferredAt: new Date(),
        },
      });
    } else {
      await (db as any).businessProfile.create({
        data: {
          companyId: company.id,
          sector: input.sector,
          actividad: input.actividad,
          canales: input.canales,
          regimenIva: input.regimen_iva,
          modeloIngreso: input.cobro,
          subplanPGC: result,
          modulosFiscales: result.fiscal_modules.map((m) => m.model),
          inferredAt: new Date(),
        },
      });
    }

    // Set needsBusinessProfile = false
    await db.company.update({
      where: { id: company.id },
      data: { needsBusinessProfile: false },
    });

    return NextResponse.json({ inference: result });
  } catch (err) {
    return errorResponse("Error al inferir perfil empresarial", err);
  }
});
