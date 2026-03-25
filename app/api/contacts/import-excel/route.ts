import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { parseContactExcel } from "@/lib/contacts/excel-parser";
import { errorResponse } from "@/lib/utils/error-response";

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = await parseContactExcel(buffer);

    let imported = 0;
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).contact.upsert({
        where: {
          holdedId_companyId: {
            holdedId: `excel:${row.cif ?? row.name}`,
            companyId: ctx.company.id,
          },
        },
        create: {
          holdedId: `excel:${row.cif ?? row.name}`,
          name: row.name,
          cif: row.cif,
          iban: row.iban,
          type: row.type,
          companyId: ctx.company.id,
        },
        update: { name: row.name, cif: row.cif ?? undefined, iban: row.iban ?? undefined },
      });
      imported++;
    }

    return NextResponse.json({
      success: true,
      imported,
      errors,
      total: rows.length + errors.length,
    });
  } catch (err) {
    return errorResponse("Error al importar contactos.", err);
  }
}, "manage:settings");
