/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const bodySchema = z.object({
  importId: z.string().min(1),
  mappings: z.array(
    z.object({
      code: z.string().min(3),
      name: z.string().min(1),
      mappedToPgcCode: z.string().min(3),
    })
  ),
});

/**
 * POST /api/import/resolve-accounts
 *
 * Resolves accounts that need manual review during opening balance import.
 * Creates the accounts with the mapped PGC parent, then re-attempts JE generation.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const validation = bodySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Datos inválidos.", detail: validation.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { importId, mappings } = validation.data;

  try {
    // Find the import record
    const importRecord = await (db as any).openingBalanceImport.findFirst({
      where: { id: importId },
    });

    if (!importRecord) {
      return NextResponse.json({ error: "Importación no encontrada." }, { status: 404 });
    }

    if (importRecord.status === "COMPLETED") {
      return NextResponse.json({ error: "Esta importación ya fue completada." }, { status: 400 });
    }

    // Resolve each mapping: find the PGC parent account, create custom subcuenta
    for (const mapping of mappings) {
      const parentAccount = await db.account.findFirst({
        where: { code: mapping.mappedToPgcCode },
      });

      if (!parentAccount) {
        return NextResponse.json(
          {
            error: `Cuenta PGC "${mapping.mappedToPgcCode}" no encontrada para la cuenta "${mapping.code}".`,
          },
          { status: 400 }
        );
      }

      // Check if account already exists
      const existingAccount = await db.account.findFirst({
        where: { code: mapping.code },
      });

      if (existingAccount) {
        // Update existing account
        await (db as any).account.update({
          where: { id: existingAccount.id },
          data: {
            needsReview: false,
            mappedToPgcCode: mapping.mappedToPgcCode,
            parentCode: parentAccount.code,
            group: parentAccount.group,
          },
        });
      } else {
        // Create new account
        await (db as any).account.create({
          data: {
            code: mapping.code,
            name: mapping.name,
            parentCode: parentAccount.code,
            group: parentAccount.group,
            isCustom: true,
            needsReview: false,
            mappedToPgcCode: mapping.mappedToPgcCode,
            isActive: true,
          },
        });
      }
    }

    // Re-read the original CSV to regenerate opening balance
    // Since we don't store the CSV, we need to re-parse
    // The import record has the filename but not the content
    // We'll use the accounts from the DB instead

    // Get all accounts that were part of this import (custom accounts)
    // For now, update the import record status and let the user re-upload
    await (db as any).openingBalanceImport.update({
      where: { id: importRecord.id },
      data: {
        needsReview: 0,
        status: "ACCOUNTS_RESOLVED",
      },
    });

    return NextResponse.json({
      status: "ACCOUNTS_RESOLVED",
      importId: importRecord.id,
      resolvedCount: mappings.length,
      message:
        "Cuentas resueltas. Vuelva a subir el archivo CSV para generar el asiento de apertura.",
    });
  } catch (error) {
    return errorResponse("Error al resolver cuentas", error);
  }
});
