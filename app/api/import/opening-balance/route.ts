/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { parseBalanceCSV } from "@/lib/import/balance-parser";
import { mapAccountsFromBalance } from "@/lib/import/account-mapper";
import { generateOpeningBalance } from "@/lib/import/opening-balance";
import { z } from "zod";

const querySchema = z.object({
  periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
});

/**
 * POST /api/import/opening-balance
 *
 * Imports a trial balance CSV to create an opening journal entry.
 * Accepts multipart/form-data with a "file" field and "periodDate" field.
 *
 * Flow:
 * 1. Parse CSV → detect columns, parse Spanish amounts
 * 2. Map accounts to PGC → auto-map or flag for review
 * 3. If all resolved → generate opening JE as DRAFT
 * 4. If needsReview > 0 → return NEEDS_REVIEW with mapping details
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const { user } = ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba multipart/form-data con archivo CSV." },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const periodDateRaw = formData.get("periodDate") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Falta el archivo CSV." }, { status: 400 });
  }

  const dateValidation = querySchema.safeParse({ periodDate: periodDateRaw });
  if (!dateValidation.success) {
    return NextResponse.json(
      {
        error: "Fecha inválida.",
        detail: dateValidation.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const periodDate = new Date(dateValidation.data.periodDate);

  try {
    // 1. Parse CSV
    const content = await file.text();
    const parsed = parseBalanceCSV(content);

    if (parsed.accounts.length === 0) {
      return NextResponse.json(
        {
          error: "No se encontraron cuentas válidas en el archivo.",
          warnings: parsed.warnings,
        },
        { status: 400 }
      );
    }

    // 2. Map accounts
    const mapping = await mapAccountsFromBalance(parsed.accounts, db);

    // 3. Create import record
    const importRecord = await (db as any).openingBalanceImport.create({
      data: {
        filename: file.name,
        periodDate,
        totalAccounts: parsed.accounts.length,
        autoMapped: mapping.autoMapped.length,
        needsReview: mapping.needsReview.length,
        status: mapping.needsReview.length > 0 ? "NEEDS_REVIEW" : "PENDING",
        createdBy: user.id,
      },
    });

    // 4. If accounts need review, return early
    if (mapping.needsReview.length > 0) {
      return NextResponse.json({
        status: "NEEDS_REVIEW",
        importId: importRecord.id,
        totalAccounts: parsed.accounts.length,
        existing: mapping.existing.length,
        autoMapped: mapping.autoMapped.length,
        needsReview: mapping.needsReview,
        warnings: parsed.warnings,
      });
    }

    // 5. Generate opening balance JE
    const result = await generateOpeningBalance(parsed.accounts, periodDate, db);

    // Update import record
    await (db as any).openingBalanceImport.update({
      where: { id: importRecord.id },
      data: {
        status: result.journalEntryId ? "COMPLETED" : "ERROR",
        journalEntryId: result.journalEntryId,
      },
    });

    return NextResponse.json({
      status: result.journalEntryId ? "COMPLETED" : "ERROR",
      importId: importRecord.id,
      journalEntryId: result.journalEntryId,
      totalAccounts: parsed.accounts.length,
      existing: mapping.existing.length,
      autoMapped: mapping.autoMapped.length,
      needsReview: 0,
      warnings: [...parsed.warnings, ...result.warnings],
    });
  } catch (error) {
    return errorResponse("Error al importar balance de apertura", error);
  }
});
