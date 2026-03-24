import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoice: { findMany: vi.fn() },
  account: { findFirst: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
  badDebtTracker: {
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { scanBadDebts, createProvision } from "@/lib/accounting/bad-debt";

describe("Bad Debt Tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoice.findMany.mockResolvedValue([]);
    mockDb.badDebtTracker.findFirst.mockResolvedValue(null);
    mockDb.badDebtTracker.create.mockResolvedValue({ id: "bdt_new" });
    mockDb.badDebtTracker.update.mockResolvedValue({});
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 10 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_new" });
  });

  it("invoice overdue < 6 months without claim → NOT deductible", async () => {
    const referenceDate = new Date("2026-06-01");
    // Due date 4 months ago (< 6 months, > 90 days)
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_1",
        totalAmount: 5000,
        amountPaid: 0,
        dueDate: new Date("2026-02-01"), // ~4 months overdue
      },
    ]);
    mockDb.badDebtTracker.findFirst.mockResolvedValue(null);

    const result = await scanBadDebts(mockDb as any, referenceDate);

    expect(result.created).toBe(1);
    expect(mockDb.badDebtTracker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: "inv_1",
          isTaxDeductible: false,
          status: "PROVISION_ACCOUNTING",
        }),
      })
    );
  });

  it("invoice overdue >= 6 months WITH claim → deductible", async () => {
    const referenceDate = new Date("2026-09-01");
    // Due date 7 months ago
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_2",
        totalAmount: 8000,
        amountPaid: 1000,
        dueDate: new Date("2026-02-01"), // ~7 months overdue
      },
    ]);
    // Existing tracker with a claim
    mockDb.badDebtTracker.findFirst.mockResolvedValue({
      id: "bdt_2",
      claimType: "BUROFAX",
      taxDeductibleDate: null,
    });

    const result = await scanBadDebts(mockDb as any, referenceDate);

    expect(result.updated).toBe(1);
    expect(result.provisionTax).toBe(1);
    expect(mockDb.badDebtTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isTaxDeductible: true,
          status: "PROVISION_TAX",
          taxDeductibleDate: referenceDate,
        }),
      })
    );
  });

  it("invoice overdue >= 6 months WITHOUT claim → NOT deductible", async () => {
    const referenceDate = new Date("2026-09-01");
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_3",
        totalAmount: 3000,
        amountPaid: 0,
        dueDate: new Date("2026-02-01"), // ~7 months
      },
    ]);
    // Existing tracker without claim
    mockDb.badDebtTracker.findFirst.mockResolvedValue({
      id: "bdt_3",
      claimType: null,
      taxDeductibleDate: null,
    });

    const result = await scanBadDebts(mockDb as any, referenceDate);

    expect(result.updated).toBe(1);
    expect(result.provisionAccounting).toBe(1);
    expect(result.provisionTax).toBe(0);
    expect(mockDb.badDebtTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isTaxDeductible: false,
          status: "PROVISION_ACCOUNTING",
        }),
      })
    );
  });

  it("DEBTOR_INSOLVENCY → deductible immediately", async () => {
    const referenceDate = new Date("2026-05-01");
    // Only 4 months overdue but debtor is insolvent
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_4",
        totalAmount: 10000,
        amountPaid: 0,
        dueDate: new Date("2026-01-01"), // ~4 months
      },
    ]);
    mockDb.badDebtTracker.findFirst.mockResolvedValue({
      id: "bdt_4",
      claimType: "DEBTOR_INSOLVENCY",
      taxDeductibleDate: null,
    });

    const result = await scanBadDebts(mockDb as any, referenceDate);

    expect(result.updated).toBe(1);
    expect(result.provisionTax).toBe(1);
    expect(mockDb.badDebtTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isTaxDeductible: true,
          status: "PROVISION_TAX",
        }),
      })
    );
  });

  it("createProvision → JE with 694/490", async () => {
    mockDb.badDebtTracker.findUniqueOrThrow.mockResolvedValue({
      id: "bdt_5",
      invoiceId: "inv_5",
      provisionAmount: 6000,
      provisionEntryId: null,
    });
    mockDb.account.findFirst
      .mockResolvedValueOnce({ id: "acc_694" }) // 694
      .mockResolvedValueOnce({ id: "acc_490" }); // 490
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 20 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_prov" });

    const result = await createProvision(mockDb as any, "bdt_5");

    expect(result.journalEntryId).toBe("je_prov");
    expect(mockDb.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: 21,
          status: "DRAFT",
          type: "ADJUSTMENT",
          lines: {
            create: [
              expect.objectContaining({
                accountId: "acc_694",
                debit: 6000,
                credit: 0,
              }),
              expect.objectContaining({
                accountId: "acc_490",
                debit: 0,
                credit: 6000,
              }),
            ],
          },
        }),
      })
    );
    // Tracker should be updated with the provision entry ID
    expect(mockDb.badDebtTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bdt_5" },
        data: { provisionEntryId: "je_prov" },
      })
    );
  });
});
