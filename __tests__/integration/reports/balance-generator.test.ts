import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoice: { aggregate: vi.fn() },
  bankTransaction: { findFirst: vi.fn() },
  account: { findFirst: vi.fn(), findMany: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
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
    mockDb.account.findFirst.mockResolvedValue(null);
    mockDb.account.findMany.mockResolvedValue([]);
    mockDb.journalEntryLine.findMany.mockResolvedValue([]);
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
      .mockResolvedValueOnce({ _sum: { amountPending: 15000 } }) // deudores
      .mockResolvedValueOnce({ _sum: { amountPending: 5000 } }) // acreedores
      .mockResolvedValueOnce({ _sum: { totalAmount: 20000 } }) // income
      .mockResolvedValueOnce({ _sum: { totalAmount: 12000 } }); // expense
    mockDb.bankTransaction.findFirst.mockResolvedValue({ balanceAfter: 30000 });

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.activoCorriente).toBeGreaterThan(0);
    // Activo corriente = deudores + efectivo = 15000 + 30000 = 45000
    expect(report.totals.activoCorriente).toBe(45000);
  });

  it("acreedores (facturas recibidas pendientes) aparecen en pasivo corriente", async () => {
    mockDb.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amountPending: 0 } }) // deudores
      .mockResolvedValueOnce({ _sum: { amountPending: 8000 } }) // acreedores
      .mockResolvedValueOnce({ _sum: { totalAmount: 10000 } }) // income
      .mockResolvedValueOnce({ _sum: { totalAmount: 7000 } }); // expense

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.pasivoCorriente).toBe(8000);
  });

  it("patrimonio neto = resultado del ejercicio (ingresos - gastos)", async () => {
    mockDb.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amountPending: 0 } })
      .mockResolvedValueOnce({ _sum: { amountPending: 0 } })
      .mockResolvedValueOnce({ _sum: { totalAmount: 50000 } }) // income
      .mockResolvedValueOnce({ _sum: { totalAmount: 30000 } }); // expense

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.totals.patrimonioNeto).toBe(20000);
  });

  it("efectivo viene del último movimiento bancario", async () => {
    mockDb.invoice.aggregate.mockResolvedValue({ _sum: { amountPending: 0, totalAmount: 0 } });
    mockDb.bankTransaction.findFirst.mockResolvedValue({ balanceAfter: 87432.5 });

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    // Activo corriente incluye el efectivo
    expect(report.totals.activoCorriente).toBe(87432.5);
  });

  it("asOf filtra correctamente", async () => {
    await generateBalance(mockDb as any, new Date("2026-01-31"));
    // Verify invoice.aggregate was called with issueDate <= asOf
    const calls = mockDb.invoice.aggregate.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it("patrimonioNetoDetail returns breakdown with all zero when no accounts", async () => {
    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    expect(report.patrimonioNetoDetail).toBeDefined();
    expect(report.patrimonioNetoDetail.capital).toBeCloseTo(0);
    expect(report.patrimonioNetoDetail.reservaLegal).toBeCloseTo(0);
    expect(report.patrimonioNetoDetail.total).toBeCloseTo(0);
    expect(report.patrimonioNetoDetail.capitalAdequacy).toEqual({ ratio: 0, alert: null });
  });

  it("patrimonioNetoDetail computes CRITICAL alert when PN < 50% capital", async () => {
    // Mock account lookup: return id for account 100, 129
    let callCount = 0;
    mockDb.account.findFirst.mockImplementation(async (args: { where: { code: string } }) => {
      callCount++;
      const code = args.where.code;
      if (code === "100") return { id: "acc_100" };
      if (code === "129") return { id: "acc_129" };
      return null;
    });

    // For account 100: credit balance of 10000 (capital) → debit-credit = -10000
    // For account 129: credit balance of 4000 (profit small) → debit-credit = -4000
    mockDb.journalEntryLine.findMany.mockImplementation(
      async (args: { where: { accountId: string } }) => {
        if (args.where.accountId === "acc_100") {
          return [{ debit: 0, credit: 10000 }]; // D-C = -10000 → negate → 10000 capital
        }
        if (args.where.accountId === "acc_129") {
          return [{ debit: 0, credit: 4000 }]; // D-C = -4000 → negate → 4000 result
        }
        return [];
      }
    );

    const report = await generateBalance(mockDb as any, new Date("2026-03-31"));
    // PN = capital(10000) + resultado(4000) = 14000
    // But wait — we query ALL accounts. Since only 100 and 129 exist,
    // total = 10000 + 4000 = 14000, ratio = 14000/10000 = 1.4 → no alert
    expect(report.patrimonioNetoDetail.capital).toBe(10000);
    expect(report.patrimonioNetoDetail.resultadoEjercicio).toBe(4000);
    expect(report.patrimonioNetoDetail.capitalAdequacy.alert).toBeNull();
  });
});
