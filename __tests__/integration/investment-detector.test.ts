import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectInvestmentOrCapex } from "@/lib/reconciliation/detectors/investment-detector";

const mockDb = {
  bankTransaction: { count: vi.fn().mockResolvedValue(0) },
  investment: { findFirst: vi.fn().mockResolvedValue(null) },
};

function buildTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx_1",
    amount: -100000,
    concept: "PAGO PROVEEDOR",
    counterpartName: "Empresa X SL",
    counterpartIban: null,
    status: "PENDING",
    valueDate: new Date(),
    ...overrides,
  };
}

describe("Investment/CAPEX Detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.bankTransaction.count.mockResolvedValue(0);
    mockDb.investment.findFirst.mockResolvedValue(null);
  });

  it("pago -500K a sociedad sin historial → INVESTMENT_ACQUISITION", async () => {
    const tx = buildTx({
      amount: -500000,
      concept: "ADQUISICION PARTICIPACION EMPRESA X SL",
    });

    const result = await detectInvestmentOrCapex(tx as any, mockDb as any);
    expect(result.isCapexOrInvestment).toBe(true);
    expect(result.suggestedCategory).toBe("INVESTMENT_ACQUISITION");
    expect(result.suggestedPgcAccount).toBe("240");
    expect(result.requiredDocuments.length).toBeGreaterThan(0);
  });

  it("cobro +50K con concepto dividendo → INVESTMENT_RETURN", async () => {
    const tx = buildTx({
      amount: 50000,
      concept: "DIVIDENDO EMPRESA X SL EJERCICIO 2025",
    });

    const result = await detectInvestmentOrCapex(tx as any, mockDb as any);
    expect(result.isCapexOrInvestment).toBe(true);
    expect(result.suggestedCategory).toBe("INVESTMENT_RETURN");
    expect(result.suggestedPgcAccount).toBe("760");
  });

  it("pago -80K con concepto maquinaria → CAPEX_ACQUISITION", async () => {
    const tx = buildTx({
      amount: -80000,
      concept: "PAGO MAQUINARIA LINEA PRODUCCION",
    });

    const result = await detectInvestmentOrCapex(tx as any, mockDb as any);
    expect(result.isCapexOrInvestment).toBe(true);
    expect(result.suggestedCategory).toBe("CAPEX_ACQUISITION");
    expect(result.suggestedPgcAccount).toBe("213");
  });

  it("pago -300K a proveedor con historial operativo → NO detecta como CAPEX", async () => {
    mockDb.bankTransaction.count.mockResolvedValue(12); // has operational history

    const tx = buildTx({
      amount: -300000,
      concept: "PAGO PROVEEDOR MATERIALES",
    });

    const result = await detectInvestmentOrCapex(tx as any, mockDb as any);
    expect(result.isCapexOrInvestment).toBe(false);
  });

  it("cobro +120K amortización préstamo concedido → LOAN_REPAYMENT_RECEIVED", async () => {
    const tx = buildTx({
      amount: 120000,
      concept: "DEVOLUCION PRESTAMO CONCEDIDO A FILIAL",
    });

    const result = await detectInvestmentOrCapex(tx as any, mockDb as any);
    expect(result.isCapexOrInvestment).toBe(true);
    expect(result.suggestedCategory).toBe("LOAN_REPAYMENT_RECEIVED");
  });

  it("pago -15K software licencia perpetua → CAPEX_ACQUISITION cuenta 206", async () => {
    const tx = buildTx({
      amount: -15000,
      concept: "LICENCIA PERPETUA SOFTWARE ERP",
    });

    const result = await detectInvestmentOrCapex(tx as any, mockDb as any);
    expect(result.isCapexOrInvestment).toBe(true);
    expect(result.suggestedCategory).toBe("CAPEX_ACQUISITION");
    expect(result.suggestedPgcAccount).toBe("206");
  });
});
