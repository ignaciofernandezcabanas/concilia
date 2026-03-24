import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoice: { findMany: vi.fn() },
  bankTransaction: { findMany: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { generateWithholdingReconciliation } from "@/lib/reports/withholding-reconciliation";

describe("Withholding Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoice.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
  });

  it("perfect match → discrepancyType NONE", async () => {
    // Q1 2026: received invoices with withholdings
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_1",
        totalAmount: 1000,
        netAmount: 850, // 1000 - 0 VAT - 150 withholding
        vatAmount: 0,
      },
      {
        id: "inv_2",
        totalAmount: 2000,
        netAmount: 1700,
        vatAmount: 0,
      },
    ]);
    // Total withholding: 150 + 300 = 450€

    mockDb.bankTransaction.findMany.mockResolvedValue([
      {
        id: "tx_1",
        valueDate: new Date("2026-04-15"),
        amount: -450,
        concept: "PAGO AEAT MODELO 111 RETENCIONES",
        counterpartName: "AGENCIA TRIBUTARIA",
      },
    ]);

    const report = await generateWithholdingReconciliation(mockDb as any, 1, 2026, "111");

    expect(report.discrepancyType).toBe("NONE");
    expect(report.theoreticalWithholding).toBe(450);
    expect(report.totalPaid).toBe(450);
    expect(report.invoiceCount).toBe(2);
  });

  it("missing payment → MISSING_PAYMENT", async () => {
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_3",
        totalAmount: 5000,
        netAmount: 4250,
        vatAmount: 0,
      },
    ]);
    // Withholding: 750€

    // No bank payments
    mockDb.bankTransaction.findMany.mockResolvedValue([]);

    const report = await generateWithholdingReconciliation(mockDb as any, 2, 2026, "115");

    expect(report.discrepancyType).toBe("MISSING_PAYMENT");
    expect(report.theoreticalWithholding).toBe(750);
    expect(report.totalPaid).toBe(0);
    expect(report.modelo).toBe("115");
  });

  it("multiple modelos (111 + 115) handled separately", async () => {
    // Same invoices for both calls
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_4",
        totalAmount: 1000,
        netAmount: 850,
        vatAmount: 0,
      },
    ]);
    // Withholding: 150€

    // Bank has payment for 111 only
    mockDb.bankTransaction.findMany.mockResolvedValue([
      {
        id: "tx_2",
        valueDate: new Date("2026-04-10"),
        amount: -150,
        concept: "PAGO AEAT MODELO 111",
        counterpartName: "HACIENDA",
      },
    ]);

    const report111 = await generateWithholdingReconciliation(mockDb as any, 1, 2026, "111");
    expect(report111.discrepancyType).toBe("NONE");
    expect(report111.totalPaid).toBe(150);
    expect(report111.modelo).toBe("111");

    // Now for 115 — same bank txs but concept says "111", not "115"
    const report115 = await generateWithholdingReconciliation(mockDb as any, 1, 2026, "115");
    expect(report115.discrepancyType).toBe("MISSING_PAYMENT");
    expect(report115.totalPaid).toBe(0);
    expect(report115.modelo).toBe("115");
  });
});
