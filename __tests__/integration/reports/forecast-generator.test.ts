import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  bankTransaction: { findFirst: vi.fn(), findMany: vi.fn() },
  invoice: { findMany: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { generateForecast } from "@/lib/reports/forecast-generator";

describe("Forecast Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.bankTransaction.findFirst.mockResolvedValue({
      balanceAfter: 50000,
      valueDate: new Date("2026-03-20"),
    });
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
    mockDb.invoice.findMany.mockResolvedValue([]);
  });

  it("genera 12 semanas por defecto", async () => {
    const report = await generateForecast(mockDb as any);
    expect(report.weeks).toHaveLength(12);
    expect(report.horizon).toBe(12);
  });

  it("saldo actual viene del último movimiento bancario", async () => {
    mockDb.bankTransaction.findFirst.mockResolvedValue({
      balanceAfter: 87432.5,
      valueDate: new Date(),
    });

    const report = await generateForecast(mockDb as any);
    expect(report.currentBalance).toBe(87432.5);
  });

  it("facturas emitidas pendientes aparecen como cobros esperados", async () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_1",
        type: "ISSUED",
        totalAmount: 5000,
        amountPending: 5000,
        dueDate: nextWeek,
        status: "PENDING",
        contact: { name: "Cliente SA", avgPaymentDays: null },
      },
    ]);

    const report = await generateForecast(mockDb as any);
    expect(report.totals.totalExpectedInflows).toBeGreaterThan(0);
  });

  it("facturas recibidas pendientes aparecen como pagos esperados", async () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_2",
        type: "RECEIVED",
        totalAmount: 3000,
        amountPending: 3000,
        dueDate: nextWeek,
        status: "PENDING",
        contact: { name: "Proveedor SL", avgPaymentDays: null },
      },
    ]);

    const report = await generateForecast(mockDb as any);
    expect(report.totals.totalExpectedOutflows).toBeGreaterThan(0);
  });

  it("saldo proyectado = saldo actual + flujos acumulados", async () => {
    const report = await generateForecast(mockDb as any);
    // Without any invoices/recurring, projected end = current balance
    expect(report.totals.projectedEndBalance).toBe(50000);
  });

  it("horizonte personalizado funciona", async () => {
    const report = await generateForecast(mockDb as any, 4);
    expect(report.weeks).toHaveLength(4);
    expect(report.horizon).toBe(4);
  });

  it("sin saldo bancario → currentBalance 0", async () => {
    mockDb.bankTransaction.findFirst.mockResolvedValue(null);

    const report = await generateForecast(mockDb as any);
    expect(report.currentBalance).toBe(0);
  });
});
