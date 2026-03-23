import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoice: { findMany: vi.fn() },
  bankTransaction: { findMany: vi.fn(), findFirst: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { generateReconciliationReport } from "@/lib/reports/reconciliation-report";

describe("Reconciliation Report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoice.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findFirst.mockResolvedValue(null);
  });

  it("mes vacío → tasa 100%, sin pendientes", async () => {
    const report = await generateReconciliationReport(mockDb as any, "2026-03");
    expect(report.reconciliationRate).toBe(100);
    expect(report.unreconciledInvoices).toHaveLength(0);
    expect(report.unreconciledTransactions).toHaveLength(0);
  });

  it("facturas sin conciliar listadas correctamente", async () => {
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_1", number: "FRA-001", type: "ISSUED", totalAmount: 5000,
        amountPending: 5000, issueDate: new Date("2026-03-10"), dueDate: new Date("2026-04-10"),
        status: "PENDING", description: "Servicios marzo",
        contact: { name: "Cliente SA" },
        reconciliations: [], // no reconciliation
      },
    ]);

    const report = await generateReconciliationReport(mockDb as any, "2026-03");
    expect(report.unreconciledInvoices).toHaveLength(1);
    expect(report.unreconciledInvoices[0].number).toBe("FRA-001");
    expect(report.totalUnreconciledInvoices).toBe(5000); // sum of amounts
  });

  it("txs sin conciliar listadas correctamente", async () => {
    mockDb.bankTransaction.findMany.mockResolvedValue([
      {
        id: "tx_1", amount: -1200, concept: "PAGO PROVEEDOR", valueDate: new Date("2026-03-15"),
        counterpartName: "Proveedor SL", counterpartIban: "ES76...", status: "PENDING",
        detectedType: null,
        reconciliations: [],
      },
    ]);

    const report = await generateReconciliationReport(mockDb as any, "2026-03");
    expect(report.unreconciledTransactions).toHaveLength(1);
    expect(report.unreconciledTransactions[0].amount).toBe(-1200);
  });

  it("calcula reconciliationRate correctamente con items parcialmente conciliados", async () => {
    mockDb.invoice.findMany.mockResolvedValue([
      { id: "inv_1", reconciliations: [{ status: "APPROVED" }], number: "1", type: "ISSUED", totalAmount: 100, amountPending: 0, issueDate: new Date("2026-03-01"), status: "PAID", contact: null },
      { id: "inv_2", reconciliations: [], number: "2", type: "ISSUED", totalAmount: 200, amountPending: 200, issueDate: new Date("2026-03-05"), status: "PENDING", contact: null },
    ]);
    mockDb.bankTransaction.findMany.mockResolvedValue([
      { id: "tx_1", reconciliations: [{ status: "APPROVED" }], amount: 100, concept: "COBRO", valueDate: new Date("2026-03-01"), status: "RECONCILED" },
      { id: "tx_2", reconciliations: [], amount: -500, concept: "PAGO", valueDate: new Date("2026-03-10"), status: "PENDING" },
    ]);

    const report = await generateReconciliationReport(mockDb as any, "2026-03");
    // 2 reconciled out of 4 total = 50%
    expect(report.reconciliationRate).toBe(50);
  });
});
