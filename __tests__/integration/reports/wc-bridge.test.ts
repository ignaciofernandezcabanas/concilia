/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the PyG generator
vi.mock("@/lib/reports/pyg-generator", () => ({
  generatePyG: vi.fn(),
}));

const mockDb = {
  account: { findMany: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
  bankTransaction: { findMany: vi.fn(), findFirst: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { generateWCBridge } from "@/lib/reports/wc-bridge";
import { generatePyG } from "@/lib/reports/pyg-generator";

const basePyGResult = {
  from: "2026-01-01",
  to: "2026-03-31",
  level: "titles" as const,
  currency: "EUR",
  lines: [
    { code: "1", label: "Ventas", amount: 50000, percentOverRevenue: 100 },
    { code: "2", label: "Var existencias", amount: 0, percentOverRevenue: 0 },
    { code: "3", label: "Trabajos", amount: 0, percentOverRevenue: 0 },
    { code: "4", label: "Aprovisionamientos", amount: -20000, percentOverRevenue: -40 },
    { code: "5", label: "Otros ingresos", amount: 0, percentOverRevenue: 0 },
    { code: "6", label: "Gastos personal", amount: -15000, percentOverRevenue: -30 },
    { code: "7", label: "Otros gastos", amount: -3000, percentOverRevenue: -6 },
    { code: "8", label: "Amortización", amount: -2000, percentOverRevenue: -4 },
    { code: "9", label: "Provisiones", amount: -500, percentOverRevenue: -1 },
    { code: "10", label: "Excesos provisiones", amount: 0, percentOverRevenue: 0 },
    { code: "11", label: "Deterioro", amount: 0, percentOverRevenue: 0 },
    { code: "A.1", label: "Resultado explotación", amount: 9500, percentOverRevenue: 19 },
    { code: "12", label: "Ingresos financieros", amount: 100, percentOverRevenue: 0.2 },
    { code: "13", label: "Gastos financieros", amount: -200, percentOverRevenue: -0.4 },
    { code: "14", label: "Var valor razonable", amount: 0, percentOverRevenue: 0 },
    { code: "15", label: "Dif cambio", amount: 0, percentOverRevenue: 0 },
    { code: "16", label: "Deterioro financiero", amount: 0, percentOverRevenue: 0 },
    { code: "A.2", label: "Resultado financiero", amount: -100, percentOverRevenue: -0.2 },
    { code: "A.3", label: "Resultado antes impuestos", amount: 9400, percentOverRevenue: 18.8 },
    { code: "17", label: "Impuestos", amount: -2350, percentOverRevenue: -4.7 },
    { code: "A.4", label: "Resultado ejercicio", amount: 7050, percentOverRevenue: 14.1 },
    { code: "EBITDA", label: "EBITDA", amount: 12000, percentOverRevenue: 24 },
  ],
  results: {
    resultadoExplotacion: 9500,
    resultadoFinanciero: -100,
    resultadoAntesImpuestos: 9400,
    resultadoEjercicio: 7050,
    ebitda: 12000,
  },
  generatedAt: new Date().toISOString(),
};

describe("WC Bridge Generator", () => {
  const from = new Date("2026-01-01");
  const to = new Date("2026-03-31");

  beforeEach(() => {
    vi.clearAllMocks();
    (generatePyG as any).mockResolvedValue({ ...basePyGResult });
    mockDb.account.findMany.mockResolvedValue([]);
    mockDb.journalEntryLine.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findFirst.mockResolvedValue(null);
  });

  it("bridge with no WC changes → operatingCashflow = EBITDA", async () => {
    const report = await generateWCBridge(mockDb as any, from, to);

    // netIncome = 7050, depreciation = |−2000| = 2000, provisions = |−500| = 500
    // EBITDA = 7050 + 2000 + 500 = 9550
    expect(report.netIncome).toBe(7050);
    expect(report.ebitda).toBe(9550);
    // No WC changes, no CAPEX, no financing → operating CF = EBITDA
    expect(report.operatingCashflow).toBe(report.ebitda);
  });

  it("AR increase → reduces operating cashflow", async () => {
    // Simulate AR accounts (430-436) exist
    mockDb.account.findMany.mockImplementation(
      ({ where }: { where: { code: { gte: string; lte: string } } }) => {
        if (where.code.gte === "430") {
          return Promise.resolve([{ id: "acct_430" }]);
        }
        return Promise.resolve([]);
      }
    );

    // AR grew by 3000: debit 5000, credit 2000 → delta = +3000
    mockDb.journalEntryLine.findMany.mockImplementation(
      ({ where }: { where: { accountId: { in: string[] } } }) => {
        if (where.accountId.in.includes("acct_430")) {
          return Promise.resolve([{ debit: 5000, credit: 2000 }]);
        }
        return Promise.resolve([]);
      }
    );

    const report = await generateWCBridge(mockDb as any, from, to);

    // EBITDA = 9550, AR delta = +3000 (cash tied up in receivables)
    // Operating CF = 9550 - 3000 = 6550
    expect(report.operatingCashflow).toBe(6550);
    expect(report.operatingCashflow).toBeLessThan(report.ebitda);
  });

  it("AP increase → increases operating cashflow", async () => {
    // Simulate AP accounts (400-406) exist
    mockDb.account.findMany.mockImplementation(
      ({ where }: { where: { code: { gte: string; lte: string } } }) => {
        if (where.code.gte === "400") {
          return Promise.resolve([{ id: "acct_400" }]);
        }
        return Promise.resolve([]);
      }
    );

    // AP grew by 3000: debit 1000, credit 4000 → delta = -3000 (credit side)
    // For liabilities: negative delta = balance grew
    mockDb.journalEntryLine.findMany.mockImplementation(
      ({ where }: { where: { accountId: { in: string[] } } }) => {
        if (where.accountId.in.includes("acct_400")) {
          return Promise.resolve([{ debit: 1000, credit: 4000 }]);
        }
        return Promise.resolve([]);
      }
    );

    const report = await generateWCBridge(mockDb as any, from, to);

    // EBITDA = 9550, AP delta (debit-credit) = -3000
    // Operating CF = 9550 - 0 - (-3000) = 9550 + 3000 = 12550
    // AP increase = source of cash (we owe more but kept the cash)
    expect(report.operatingCashflow).toBe(12550);
    expect(report.operatingCashflow).toBeGreaterThan(report.ebitda);
  });
});
