/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parse fixed assets from an Excel file.
 * Headers: Nombre, Fecha adquisición, Coste, Vida útil (meses), Cuenta activo, Cuenta amortización, Cuenta amort. acumulada
 */

import ExcelJS from "exceljs";

export interface ParsedAssetRow {
  name: string;
  acquisitionDate: Date;
  cost: number;
  usefulLifeMonths: number;
  assetAccountCode: string;
  depreciationAccountCode: string;
  accumDepAccountCode: string;
}

export interface AssetParseResult {
  rows: ParsedAssetRow[];
  errors: string[];
}

export async function parseAssetExcel(buffer: Buffer): Promise<AssetParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [] };

  const rows: ParsedAssetRow[] = [];
  const errors: string[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const vals = (row.values as unknown[]).slice(1);
    const name = String(vals[0] ?? "").trim();
    const fechaRaw = vals[1];
    const coste = parseFloat(String(vals[2] ?? ""));
    const vida = parseInt(String(vals[3] ?? ""));
    const cuentaActivo = String(vals[4] ?? "").trim();
    const cuentaAmort = String(vals[5] ?? "").trim();
    const cuentaAcum = String(vals[6] ?? "").trim();

    if (!name) {
      errors.push(`Fila ${rowNumber}: nombre vacío`);
      return;
    }

    if (isNaN(coste) || coste <= 0) {
      errors.push(`Fila ${rowNumber}: coste inválido`);
      return;
    }

    if (isNaN(vida) || vida <= 0) {
      errors.push(`Fila ${rowNumber}: vida útil inválida`);
      return;
    }

    let acquisitionDate: Date;
    if (fechaRaw instanceof Date) {
      acquisitionDate = fechaRaw;
    } else {
      const s = String(fechaRaw ?? "");
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        acquisitionDate = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      } else {
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) {
          acquisitionDate = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
        } else {
          errors.push(`Fila ${rowNumber}: fecha "${fechaRaw}" no válida`);
          return;
        }
      }
    }

    rows.push({
      name,
      acquisitionDate,
      cost: coste,
      usefulLifeMonths: vida,
      assetAccountCode: cuentaActivo || "213",
      depreciationAccountCode: cuentaAmort || "681",
      accumDepAccountCode: cuentaAcum || "281",
    });
  });

  return { rows, errors };
}
