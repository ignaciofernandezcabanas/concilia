import { describe, it, expect } from "vitest";
import { exportToExcel, exportToCsv } from "@/lib/reports/exporter";

const sampleData = [
  { codigo: "700", nombre: "Ventas", importe: 15000.50 },
  { codigo: "600", nombre: "Compras", importe: 8000.25 },
];

const columns = [
  { header: "Código", key: "codigo", type: "string" as const },
  { header: "Nombre", key: "nombre", type: "string" as const },
  { header: "Importe", key: "importe", type: "number" as const },
];

describe("Exporter", () => {
  it("exportToExcel genera un buffer no vacío", async () => {
    const buffer = await exportToExcel(sampleData, columns, { viewName: "Test" });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("exportToCsv genera string con headers", () => {
    const csv = exportToCsv(sampleData, columns, { viewName: "Test" });
    expect(csv).toContain("Código");
    expect(csv).toContain("Nombre");
    expect(csv).toContain("Importe");
  });

  it("exportToCsv incluye los datos", () => {
    const csv = exportToCsv(sampleData, columns, { viewName: "Test" });
    expect(csv).toContain("700");
    expect(csv).toContain("Ventas");
  });
});
