/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { callAIJson } from "@/lib/ai/model-router";
import { PARSE_HISTORICAL_FILE, CALIBRATE_ACCOUNT_PLAN } from "@/lib/ai/prompt-registry";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * POST /api/setup/historical/process
 *
 * Process historical accounting files (CSV/text) for calibration.
 * Parses each file, then calibrates the inferred plan with historical data.
 *
 * Input: FormData with file(s) under key "files"
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const { company } = ctx;

  try {
    // Check BusinessProfile exists
    const profile = await (db as any).businessProfile.findUnique({
      where: { companyId: company.id },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Primero debes completar el perfil empresarial (paso de inferencia)." },
        { status: 400 }
      );
    }

    if (!profile.subplanPGC) {
      return NextResponse.json(
        { error: "No hay plan inferido. Ejecuta la inferencia primero." },
        { status: 400 }
      );
    }

    // Read files from FormData
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No se han enviado archivos." }, { status: 400 });
    }

    // Parse each file
    const allAccounts: {
      code: string;
      name: string;
      has_movement: boolean;
      net_balance: number;
    }[] = [];
    const parseResults: any[] = [];

    for (const file of files) {
      const content = await file.text();
      const truncated = content.slice(0, 15000); // Limit content for LLM

      const parsed = await callAIJson(
        PARSE_HISTORICAL_FILE.task,
        PARSE_HISTORICAL_FILE.system,
        PARSE_HISTORICAL_FILE.buildUser({ content: truncated, filename: file.name }),
        PARSE_HISTORICAL_FILE.schema
      );

      if (parsed) {
        parseResults.push({ filename: file.name, ...parsed });
        allAccounts.push(...parsed.accounts);
      } else {
        parseResults.push({
          filename: file.name,
          error: "No se pudo parsear el archivo",
        });
      }
    }

    if (allAccounts.length === 0) {
      return NextResponse.json(
        {
          error: "No se pudieron extraer cuentas de los archivos.",
          parseResults,
        },
        { status: 400 }
      );
    }

    // Calibrate: inferred plan vs historical
    const calibration = await callAIJson(
      CALIBRATE_ACCOUNT_PLAN.task,
      CALIBRATE_ACCOUNT_PLAN.system,
      CALIBRATE_ACCOUNT_PLAN.buildUser({
        inferred_plan: profile.subplanPGC,
        historical_accounts: allAccounts,
        business_profile: {
          sector: profile.sector,
          actividad: profile.actividad,
          canales: profile.canales,
          regimenIva: profile.regimenIva,
        },
      }),
      CALIBRATE_ACCOUNT_PLAN.schema
    );

    if (!calibration) {
      return NextResponse.json(
        { error: "No se pudo calibrar el plan. Inténtalo de nuevo.", parseResults },
        { status: 500 }
      );
    }

    // Update BusinessProfile with calibration
    await (db as any).businessProfile.update({
      where: { companyId: company.id },
      data: {
        subplanPGC: {
          ...(profile.subplanPGC as any),
          calibration,
        },
        calibratedAt: new Date(),
        calibrationSource: files.map((f) => f.name).join(", "),
      },
    });

    // Create LearnedPattern entries for recurring patterns
    if (calibration.recurring_patterns?.length) {
      for (const pattern of calibration.recurring_patterns) {
        await (db as any).learnedPattern.create({
          data: {
            companyId: company.id,
            type: "historical_calibration",
            isActive: true,
            counterpartName: pattern.counterpart || null,
            conceptPattern: pattern.concept || null,
            predictedAction: "classify",
            predictedReason: `Patrón histórico: ${pattern.concept} (${pattern.frequency}x, media ${pattern.avg_amount}€)`,
            confidence: pattern.confidence,
            occurrences: pattern.frequency,
            correctPredictions: pattern.frequency,
          },
        });
      }
    }

    return NextResponse.json({
      parseResults,
      calibration,
    });
  } catch (err) {
    return errorResponse("Error al procesar archivos históricos", err);
  }
});
