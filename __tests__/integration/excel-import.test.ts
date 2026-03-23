import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseInvoiceExcel } from "@/lib/invoices/excel-parser";
import { parseContactExcel } from "@/lib/contacts/excel-parser";
import { parseAssetExcel } from "@/lib/fixed-assets/excel-parser";

async function createExcel(headers: string[], rows: (string | number | null | Date)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Datos");
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("Excel Import — Invoices", () => {
  it("parsea facturas válidas", async () => {
    const buffer = await createExcel(
      ["Número", "Tipo", "Fecha emisión", "Importe total", "Base imponible", "IVA", "Contacto", "CIF contacto"],
      [
        ["FRA-001", "RECIBIDA", "15/01/2026", 1210, 1000, 210, "Proveedor SL", "B12345678"],
        ["FRA-002", "EMITIDA", "01/02/2026", 605, 500, 105, "Cliente SA", "A87654321"],
      ]
    );
    const result = await parseInvoiceExcel(buffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].totalAmount).toBe(1210);
    expect(result.rows[0].type).toBe("RECEIVED");
    expect(result.rows[1].type).toBe("ISSUED");
    expect(result.errors).toHaveLength(0);
  });

  it("importe no numérico → error en esa fila", async () => {
    const buffer = await createExcel(
      ["Número", "Tipo", "Fecha emisión", "Importe total", "Contacto", "CIF contacto"],
      [
        ["FRA-001", "RECIBIDA", "15/01/2026", "abc", "Prov SL", "B12345678"],
        ["FRA-002", "RECIBIDA", "01/02/2026", 500, "Otro SL", "B99999999"],
      ]
    );
    const result = await parseInvoiceExcel(buffer);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("importe");
    expect(result.rows).toHaveLength(1);
  });

  it("factura sin número → error", async () => {
    const buffer = await createExcel(
      ["Número", "Tipo", "Fecha emisión", "Importe total"],
      [["", "RECIBIDA", "15/01/2026", 1000]]
    );
    const result = await parseInvoiceExcel(buffer);
    expect(result.errors).toHaveLength(1);
  });

  it("Excel sin filas de datos → devuelve vacío sin error", async () => {
    const buffer = await createExcel(["Número", "Tipo", "Fecha emisión", "Importe total"], []);
    const result = await parseInvoiceExcel(buffer);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe("Excel Import — Contacts", () => {
  it("parsea contacto con CIF válido", async () => {
    const buffer = await createExcel(
      ["Nombre", "CIF", "Tipo", "Email", "IBAN"],
      [["Proveedor SL", "B12345678", "PROVEEDOR", "info@prov.com", "ES7620770024003102575766"]]
    );
    const result = await parseContactExcel(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cif).toBe("B12345678");
    expect(result.rows[0].type).toBe("SUPPLIER");
  });

  it("CIF inválido → error en esa fila", async () => {
    const buffer = await createExcel(
      ["Nombre", "CIF", "Tipo"],
      [["Test", "XXINVALID", "PROVEEDOR"]]
    );
    const result = await parseContactExcel(buffer);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("CIF");
  });

  it("nombre vacío → error", async () => {
    const buffer = await createExcel(
      ["Nombre", "CIF", "Tipo"],
      [["", "B12345678", "PROVEEDOR"]]
    );
    const result = await parseContactExcel(buffer);
    expect(result.errors).toHaveLength(1);
  });
});

describe("Excel Import — Fixed Assets", () => {
  it("parsea activo válido", async () => {
    const buffer = await createExcel(
      ["Nombre", "Fecha adquisición", "Coste", "Vida útil (meses)", "Cuenta activo", "Cuenta amortización", "Cuenta amort. acumulada"],
      [["Ordenador", "01/01/2026", 1500, 48, "217", "681", "281"]]
    );
    const result = await parseAssetExcel(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cost).toBe(1500);
    expect(result.rows[0].usefulLifeMonths).toBe(48);
  });

  it("vida útil no numérica → error", async () => {
    const buffer = await createExcel(
      ["Nombre", "Fecha adquisición", "Coste", "Vida útil (meses)", "Cuenta activo"],
      [["Ordenador", "01/01/2026", 1500, "cuatro años", "217"]]
    );
    const result = await parseAssetExcel(buffer);
    expect(result.errors).toHaveLength(1);
  });
});
