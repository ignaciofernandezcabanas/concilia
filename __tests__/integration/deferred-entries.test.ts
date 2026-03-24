import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ScopedPrisma with all models used
const mockDb = {
  deferredEntry: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  journalEntry: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
  },
  invoice: {
    findFirst: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
};

import {
  registerAdvance,
  linkDeferredToInvoice,
  checkDeferredMatches,
} from "@/lib/accounting/deferred-entries";

describe("Deferred Entries (Advances)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 100 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_1" });
    mockDb.deferredEntry.create.mockResolvedValue({ id: "def_1" });
    mockDb.deferredEntry.update.mockResolvedValue({});
    mockDb.notification.create.mockResolvedValue({});
    // Mock account resolution: return id based on code
    mockDb.account.findFirst.mockImplementation(async ({ where }: { where: { code: string } }) => {
      return { id: `acct_${where.code}` };
    });
  });

  it("registerAdvance ADVANCE_RECEIVED → JE Debe 572 / Haber 438", async () => {
    const result = await registerAdvance(mockDb as never, {
      type: "ADVANCE_RECEIVED",
      contactId: "contact_1",
      amount: 5000,
      date: new Date("2026-03-15"),
      description: "Anticipo cliente ABC",
    });

    expect(result.id).toBe("def_1");

    // Journal entry created
    const jeCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(jeCall.data.status).toBe("DRAFT");
    expect(jeCall.data.type).toBe("ADJUSTMENT");
    expect(jeCall.data.lines.create).toHaveLength(2);
    // Debe 572 (banco)
    expect(jeCall.data.lines.create[0].accountId).toBe("acct_572");
    expect(jeCall.data.lines.create[0].debit).toBe(5000);
    expect(jeCall.data.lines.create[0].credit).toBe(0);
    // Haber 438 (anticipo cliente)
    expect(jeCall.data.lines.create[1].accountId).toBe("acct_438");
    expect(jeCall.data.lines.create[1].debit).toBe(0);
    expect(jeCall.data.lines.create[1].credit).toBe(5000);

    // Deferred entry created
    const defCall = mockDb.deferredEntry.create.mock.calls[0][0];
    expect(defCall.data.type).toBe("ADVANCE_RECEIVED");
    expect(defCall.data.deferredAccountCode).toBe("438");
    expect(defCall.data.remainingAmount).toBe(5000);
  });

  it("registerAdvance ADVANCE_PAID → JE Debe 407 / Haber 572", async () => {
    const result = await registerAdvance(mockDb as never, {
      type: "ADVANCE_PAID",
      contactId: "contact_2",
      amount: 3000,
      date: new Date("2026-03-20"),
    });

    expect(result.id).toBe("def_1");

    const jeCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(jeCall.data.lines.create).toHaveLength(2);
    // Debe 407 (anticipo proveedor)
    expect(jeCall.data.lines.create[0].accountId).toBe("acct_407");
    expect(jeCall.data.lines.create[0].debit).toBe(3000);
    expect(jeCall.data.lines.create[0].credit).toBe(0);
    // Haber 572 (banco)
    expect(jeCall.data.lines.create[1].accountId).toBe("acct_572");
    expect(jeCall.data.lines.create[1].debit).toBe(0);
    expect(jeCall.data.lines.create[1].credit).toBe(3000);

    const defCall = mockDb.deferredEntry.create.mock.calls[0][0];
    expect(defCall.data.type).toBe("ADVANCE_PAID");
    expect(defCall.data.deferredAccountCode).toBe("407");
  });

  it("linkDeferredToInvoice full amount → FULLY_APPLIED + reversal JE", async () => {
    mockDb.deferredEntry.findUniqueOrThrow.mockResolvedValue({
      id: "def_1",
      type: "ADVANCE_RECEIVED",
      amount: 5000,
      consumedAmount: 0,
      remainingAmount: 5000,
      status: "PENDING",
      deferredAccountCode: "438",
    });

    await linkDeferredToInvoice(mockDb as never, "def_1", "inv_1");

    // Reversal JE: Debe 438 / Haber 572
    const jeCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(jeCall.data.lines.create[0].accountId).toBe("acct_438");
    expect(jeCall.data.lines.create[0].debit).toBe(5000);
    expect(jeCall.data.lines.create[1].accountId).toBe("acct_572");
    expect(jeCall.data.lines.create[1].credit).toBe(5000);

    // Status updated
    const updateCall = mockDb.deferredEntry.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("FULLY_APPLIED");
    expect(updateCall.data.consumedAmount).toBe(5000);
    expect(updateCall.data.remainingAmount).toBe(0);
    expect(updateCall.data.linkedInvoiceId).toBe("inv_1");
  });

  it("linkDeferredToInvoice partial → PARTIALLY_APPLIED, correct remaining", async () => {
    mockDb.deferredEntry.findUniqueOrThrow.mockResolvedValue({
      id: "def_2",
      type: "ADVANCE_PAID",
      amount: 10000,
      consumedAmount: 0,
      remainingAmount: 10000,
      status: "PENDING",
      deferredAccountCode: "407",
    });

    await linkDeferredToInvoice(mockDb as never, "def_2", "inv_2", 4000);

    // Reversal JE for ADVANCE_PAID: Debe 572 / Haber 407
    const jeCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(jeCall.data.lines.create[0].accountId).toBe("acct_572");
    expect(jeCall.data.lines.create[0].debit).toBe(4000);
    expect(jeCall.data.lines.create[1].accountId).toBe("acct_407");
    expect(jeCall.data.lines.create[1].credit).toBe(4000);

    const updateCall = mockDb.deferredEntry.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("PARTIALLY_APPLIED");
    expect(updateCall.data.consumedAmount).toBe(4000);
    expect(updateCall.data.remainingAmount).toBe(6000);
  });

  it("checkDeferredMatches finds matching invoice → notification created", async () => {
    mockDb.deferredEntry.findMany.mockResolvedValue([
      {
        id: "def_3",
        type: "ADVANCE_RECEIVED",
        contactId: "contact_1",
        amount: 2000,
        remainingAmount: 2000,
        status: "PENDING",
        contact: { id: "contact_1", name: "Cliente ABC" },
      },
    ]);
    mockDb.invoice.findFirst.mockResolvedValue({
      id: "inv_match",
      number: "F-2026-042",
      totalAmount: 2000,
    });

    const count = await checkDeferredMatches(mockDb as never, "company_1");

    expect(count).toBe(1);
    expect(mockDb.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SYSTEM",
          title: "Anticipo pendiente coincide con factura",
        }),
      })
    );
    // Verify notification body contains relevant info
    const notifCall = mockDb.notification.create.mock.calls[0][0];
    expect(notifCall.data.body).toContain("2000");
    expect(notifCall.data.body).toContain("Cliente ABC");
    expect(notifCall.data.body).toContain("F-2026-042");
  });
});
