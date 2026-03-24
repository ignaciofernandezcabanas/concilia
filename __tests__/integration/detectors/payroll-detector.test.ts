/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  bankTransaction: { findMany: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { detectPayroll } from "@/lib/reconciliation/detectors/payroll-detector";
import { verifyMonthlyPayroll } from "@/lib/accounting/payroll-verification";

describe("detectPayroll", () => {
  const baseTx = {
    amount: -3500,
    concept: null as string | null,
    counterpartyName: null as string | null,
    counterpartyIban: null as string | null,
    valueDate: new Date("2026-03-28"),
  };

  it('concept "NOMINA EMPLEADOS MARZO" → SALARY, confidence > 0.8', async () => {
    const tx = { ...baseTx, concept: "NOMINA EMPLEADOS MARZO" };
    const result = await detectPayroll(tx, mockDb as any);

    expect(result.isPayroll).toBe(true);
    expect(result.payrollType).toBe("SALARY");
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.suggestedAccountCode).toBe("640");
  });

  it('concept "TGSS CUOTA EMPRESARIAL" → SS_COMPANY', async () => {
    const tx = { ...baseTx, concept: "TGSS CUOTA EMPRESARIAL" };
    const result = await detectPayroll(tx, mockDb as any);

    expect(result.isPayroll).toBe(true);
    expect(result.payrollType).toBe("SS_COMPANY");
    expect(result.suggestedAccountCode).toBe("642");
  });

  it('concept "TRF SEPA ACME SL" → NOT payroll', async () => {
    const tx = { ...baseTx, concept: "TRF SEPA ACME SL" };
    const result = await detectPayroll(tx, mockDb as any);

    expect(result.isPayroll).toBe(false);
    expect(result.payrollType).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe("verifyMonthlyPayroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("salary but no SS → missing SS_COMPANY", async () => {
    mockDb.bankTransaction.findMany.mockResolvedValue([
      {
        amount: -5000,
        concept: "NOMINA EMPLEADOS MARZO 2026",
        detectedType: "PAYROLL",
      },
      {
        amount: -1200,
        concept: "MODELO 111 IRPF 1T 2026",
        detectedType: null,
      },
    ]);

    const result = await verifyMonthlyPayroll(mockDb as any, 2026, 3);

    expect(result.complete).toBe(false);
    expect(result.missing).toContain("SS_COMPANY");
    expect(result.missing).not.toContain("SALARY");
    expect(result.missing).not.toContain("IRPF");
    expect(result.totalPayroll).toBe(6200);
    expect(result.components).toHaveLength(2);
  });
});
