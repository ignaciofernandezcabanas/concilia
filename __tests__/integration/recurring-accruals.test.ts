import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ScopedPrisma with all models used
const mockDb = {
  recurringAccrual: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  journalEntry: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
  },
};

import { processRecurringAccruals, linkAccrualToInvoice } from "@/lib/accounting/accruals";

describe("Recurring Accruals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 100 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_1" });
    mockDb.recurringAccrual.update.mockResolvedValue({});
    // Mock account resolution: return id based on code
    mockDb.account.findFirst.mockImplementation(async ({ where }: any) => {
      return { id: `acct_${where.code}` };
    });
  });

  it("calculates monthlyAmount as totalAnnualAmount / 12", () => {
    const annual = 12000;
    const monthly = Math.round((annual / 12) * 100) / 100;
    expect(monthly).toBe(1000);
  });

  it("creates journal entry DRAFT with correct accounts", async () => {
    mockDb.recurringAccrual.findMany.mockResolvedValue([
      {
        id: "acc_1",
        description: "Seguro RC anual",
        totalAnnualAmount: 12000,
        monthlyAmount: 1000,
        expenseAccountCode: "625",
        accrualAccountCode: "480",
        frequency: "MONTHLY",
        startDate: new Date("2026-01-01"),
        endDate: null,
        status: "ACTIVE",
        lastAccruedDate: null,
        totalAccrued: 0,
        autoReverse: true,
      },
    ]);

    const periodDate = new Date("2026-01-31");
    const result = await processRecurringAccruals(mockDb as any, periodDate);

    expect(result.accrualsProcessed).toBe(1);
    expect(result.entriesCreated).toBe(1);
    expect(result.totalAccrued).toBe(1000);

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.status).toBe("DRAFT");
    expect(createCall.data.lines.create).toHaveLength(2);
    expect(createCall.data.lines.create[0].accountId).toBe("acct_625");
    expect(createCall.data.lines.create[0].debit).toBe(1000);
    expect(createCall.data.lines.create[1].accountId).toBe("acct_480");
    expect(createCall.data.lines.create[1].credit).toBe(1000);
  });

  it("does not duplicate if lastAccruedDate covers the period", async () => {
    mockDb.recurringAccrual.findMany.mockResolvedValue([
      {
        id: "acc_1",
        description: "Seguro",
        monthlyAmount: 500,
        expenseAccountCode: "625",
        accrualAccountCode: "480",
        frequency: "MONTHLY",
        startDate: new Date("2026-01-01"),
        endDate: null,
        status: "ACTIVE",
        lastAccruedDate: new Date("2026-01-31"),
        totalAccrued: 500,
        autoReverse: true,
      },
    ]);

    const result = await processRecurringAccruals(mockDb as any, new Date("2026-01-15"));

    expect(result.accrualsProcessed).toBe(0);
    expect(result.entriesCreated).toBe(0);
    expect(mockDb.journalEntry.create).not.toHaveBeenCalled();
  });

  it("skips accrual with endDate in the past", async () => {
    mockDb.recurringAccrual.findMany.mockResolvedValue([
      {
        id: "acc_1",
        description: "Old contract",
        monthlyAmount: 200,
        expenseAccountCode: "621",
        accrualAccountCode: "480",
        frequency: "MONTHLY",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
        status: "ACTIVE",
        lastAccruedDate: new Date("2025-12-31"),
        totalAccrued: 2400,
      },
    ]);

    const result = await processRecurringAccruals(mockDb as any, new Date("2026-01-31"));
    expect(result.accrualsProcessed).toBe(0);
  });

  it("linkAccrualToInvoice with autoReverse creates reversal DRAFT", async () => {
    mockDb.recurringAccrual.findUniqueOrThrow.mockResolvedValue({
      id: "acc_1",
      description: "Seguro",
      expenseAccountCode: "625",
      accrualAccountCode: "480",
      autoReverse: true,
      totalAccrued: 3000,
      status: "ACTIVE",
    });
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 200 });

    const result = await linkAccrualToInvoice(mockDb as any, "acc_1", "inv_1");

    expect(result.reversed).toBe(true);
    expect(result.reversalAmount).toBe(3000);

    // Reversal entry: debe accrual (480), haber expense (625)
    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].accountId).toBe("acct_480");
    expect(createCall.data.lines.create[0].debit).toBe(3000);
    expect(createCall.data.lines.create[1].accountId).toBe("acct_625");
    expect(createCall.data.lines.create[1].credit).toBe(3000);

    // Status updated to COMPLETED
    const updateCall = mockDb.recurringAccrual.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("COMPLETED");
    expect(updateCall.data.linkedInvoiceId).toBe("inv_1");
  });

  it("linkAccrualToInvoice without autoReverse does not create reversal", async () => {
    mockDb.recurringAccrual.findUniqueOrThrow.mockResolvedValue({
      id: "acc_2",
      description: "Manual",
      expenseAccountCode: "621",
      accrualAccountCode: "480",
      autoReverse: false,
      totalAccrued: 1000,
      status: "ACTIVE",
    });

    const result = await linkAccrualToInvoice(mockDb as any, "acc_2", "inv_2");

    expect(result.reversed).toBe(false);
    expect(result.reversalAmount).toBe(0);
    expect(mockDb.journalEntry.create).not.toHaveBeenCalled();

    const updateCall = mockDb.recurringAccrual.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("COMPLETED");
  });
});
