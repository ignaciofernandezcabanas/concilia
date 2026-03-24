import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { parseAssetExcel } from "@/lib/fixed-assets/excel-parser";
import { errorResponse } from "@/lib/utils/error-response";

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = await parseAssetExcel(buffer);

    let imported = 0;
    for (const row of rows) {
      const accounts = await db.account.findMany({
        where: {
          code: {
            in: [row.assetAccountCode, row.depreciationAccountCode, row.accumDepAccountCode],
          },
        },
        select: { id: true, code: true },
      });
      const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

      const assetAccId = accountMap.get(row.assetAccountCode);
      const depAccId = accountMap.get(row.depreciationAccountCode);
      const accumAccId = accountMap.get(row.accumDepAccountCode);

      if (!assetAccId || !depAccId || !accumAccId) {
        errors.push(`${row.name}: cuentas PGC no encontradas`);
        continue;
      }

      const depreciable = row.cost;
      const monthlyDep = Math.round((depreciable / row.usefulLifeMonths) * 100) / 100;

      await db.fixedAsset.create({
        data: {
          name: row.name,
          acquisitionDate: row.acquisitionDate,
          acquisitionCost: row.cost,
          residualValue: 0,
          usefulLifeMonths: row.usefulLifeMonths,
          netBookValue: row.cost,
          monthlyDepreciation: monthlyDep,
          assetAccountId: assetAccId,
          depreciationAccountId: depAccId,
          accumDepAccountId: accumAccId,
          companyId: ctx.company.id,
        } as any,
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
    return errorResponse("Error al importar activos.", err);
  }
}, "manage:settings");
