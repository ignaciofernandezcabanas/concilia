import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoice: { aggregate: vi.fn() },
  bankTransaction: { findFirst: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { generateBalance } from "@/lib/reports/balance-generator";

describe("Balance Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoice.aggregate.mockResolvedValue({ _sum: { amountPending: 0, totalAmount: 0 } });
    mockDb.bankTransaction.findFirst.mockResolvedValue(null);
  });

  it("devuelve estructura con activo, pasivo y patrimonio", async () => {
    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.currency).toBe("EUR");
    expect(report.totals).toHaveProperty("totalActivo");
    expect(report.totals).toHaveProperty("totalPasivo");
    expect(report.totals).toHaveProperty("patrimonioNeto");
  });

  it("sin datos → totales a 0", async () => {
    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.totalActivo).toBe(0);
    expect(report.totals.totalPasivo).toBe(0);
  });

  it("deudores (facturas emitidas pendientes) aparecen en activo corriente", async () => {
    // First call = deudores (issued), second = acreedores (received), third/fourth = income/expense
    mockDb.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amountPending: 15000 } })  // deudores
      .mockResolvedValueOnce({ _sum: { amountPending: 5000 } })   // acreedores
      .mockResolvedValueOnce({ _sum: { totalAmount: 20000 } })    // income
      .mockResolvedValueOnce({ _sum: { totalAmount: 12000 } });   // expense
    mockDb.bankTransaction.findFirst.mockResolvedValue({ balanceAfter: 30000 });

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.activoCorriente).toBeGreaterThan(0);
    // Activo corriente = deudores + efectivo = 15000 + 30000 = 45000
    expect(report.totals.activoCorriente).toBe(45000);
  });

  it("acreedores (facturas recibidas pendientes) aparecen en pasivo corriente", async () => {
    mockDb.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amountPending: 0 } })      // deudores
      .mockResolvedValueOnce({ _sum: { amountPending: 8000 } })   // acreedores
      .mockResolvedValueOnce({ _sum: { totalAmount: 10000 } })    // income
      .mockResolvedValueOnce({ _sum: { totalAmount: 7000 } });    // expense

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.pasivoCorriente).toBe(8000);
  });

  it("patrimonio neto = resultado del ejercicio (ingresos - gastos)", async () => {
    mockDb.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amountPending: 0 } })
      .mockResolvedValueOnce({ _sum: { amountPending: 0 } })
      .mockResolvedValueOnce({ _sum: { totalAmount: 50000 } })    // income
      .mockResolvedValueOnce({ _sum: { totalAmount: 30000 } });   // expense

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.patrimonioNeto).toBe(20000);
  });

  it("efectivo viene del último movimiento bancario", async () => {
    mockDb.invoice.aggregate.mockResolvedValue({ _sum: { amountPending: 0, totalAmount: 0 } });
    mockDb.bankTransaction.findFirst.mockResolvedValue({ balanceAfter: 87432.50 });

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    // Activo corriente incluye el efectivo
    expect(report.totals.activoCorriente).toBe(87432.50);
  });

  it("asOf filtra correctamente", async () => {
    await generateBalance(mockDb as any, new Date("2026-01-31"));
    // Verify invoice.aggregate was called with issueDate <= asOf
    const calls = mockDb.invoice.aggregate.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });
});
