import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoiceLine: { findMany: vi.fn() },
  bankTransaction: { findMany: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { generateVatReconciliation } from "@/lib/reports/vat-reconciliation";

describe("VAT Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoiceLine.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
  });

  it("perfect match → discrepancyType NONE", async () => {
    // Q1 2026: issued invoices with 21% VAT
    mockDb.invoiceLine.findMany
      .mockResolvedValueOnce([
        // Issued lines (repercutido)
        { totalAmount: 1210, vatRate: 21, invoice: { number: "F-001", type: "ISSUED" } },
      ])
      .mockResolvedValueOnce([
        // Received lines (soportado)
        { totalAmount: 605, vatRate: 21, invoice: { number: "R-001", type: "RECEIVED" } },
      ]);

    // Expected liquidación: 210 - 105 = 105€
    // Bank payment of exactly 105€ in April window
    mockDb.bankTransaction.findMany.mockResolvedValue([
      {
        id: "tx_1",
        valueDate: new Date("2026-04-15"),
        amount: -105,
        concept: "PAGO AEAT MODELO 303",
        counterpartName: "AGENCIA TRIBUTARIA",
      },
    ]);

    const report = await generateVatReconciliation(mockDb as any, 1, 2026);

    expect(report.discrepancyType).toBe("NONE");
    expect(report.theoretical.liquidacion).toBe(105);
    expect(report.totalPaid).toBe(105);
    expect(Math.abs(report.discrepancy)).toBeLessThan(1);
  });

  it("no bank payment → MISSING_PAYMENT", async () => {
    // Q2 2026: positive liquidación but no payment found
    mockDb.invoiceLine.findMany
      .mockResolvedValueOnce([
        { totalAmount: 2420, vatRate: 21, invoice: { number: "F-010", type: "ISSUED" } },
      ])
      .mockResolvedValueOnce([]); // no received invoices

    // No bank transactions at all
    mockDb.bankTransaction.findMany.mockResolvedValue([]);

    const report = await generateVatReconciliation(mockDb as any, 2, 2026);

    expect(report.discrepancyType).toBe("MISSING_PAYMENT");
    expect(report.totalPaid).toBe(0);
    expect(report.theoretical.liquidacion).toBeGreaterThan(0);
  });

  it("amount differs → AMOUNT_MISMATCH", async () => {
    // Q3 2026: liquidación = 300€ but paid 250€
    mockDb.invoiceLine.findMany
      .mockResolvedValueOnce([
        { totalAmount: 3630, vatRate: 21, invoice: { number: "F-020", type: "ISSUED" } },
      ])
      .mockResolvedValueOnce([
        { totalAmount: 2420, vatRate: 21, invoice: { number: "R-020", type: "RECEIVED" } },
      ]);
    // Expected: repercutido 630 - soportado 420 = 210€ liquidación

    mockDb.bankTransaction.findMany.mockResolvedValue([
      {
        id: "tx_2",
        valueDate: new Date("2026-10-10"),
        amount: -150,
        concept: "PAGO MODELO 303 AEAT",
        counterpartName: null,
      },
    ]);

    const report = await generateVatReconciliation(mockDb as any, 3, 2026);

    expect(report.discrepancyType).toBe("AMOUNT_MISMATCH");
    expect(report.discrepancy).toBeGreaterThan(1);
  });

  it("negative liquidation (A_COMPENSAR) → handled correctly", async () => {
    // More soportado than repercutido → A_COMPENSAR
    mockDb.invoiceLine.findMany
      .mockResolvedValueOnce([
        { totalAmount: 605, vatRate: 21, invoice: { number: "F-030", type: "ISSUED" } },
      ])
      .mockResolvedValueOnce([
        { totalAmount: 2420, vatRate: 21, invoice: { number: "R-030", type: "RECEIVED" } },
      ]);

    // No payment expected (A_COMPENSAR)
    mockDb.bankTransaction.findMany.mockResolvedValue([]);

    const report = await generateVatReconciliation(mockDb as any, 1, 2026);

    expect(report.theoretical.liquidacion).toBeLessThan(0);
    expect(report.discrepancyType).toBe("NONE");
    expect(report.totalPaid).toBe(0);
    expect(report.details).toContain("compensar");
  });
});
