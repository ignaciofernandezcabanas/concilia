import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  reconciliation: { findFirst: vi.fn() },
  intercompanyLink: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  bankTransaction: {
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const mockTrackDecision = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reconciliation/decision-tracker", () => ({
  trackControllerDecision: mockTrackDecision,
}));

vi.mock("@/lib/reconciliation/invoice-payments", () => ({
  updateInvoicePaymentStatus: vi.fn(),
}));

vi.mock("@/lib/ai/confidence-calibrator", () => ({
  calibrateFromDecision: vi.fn(),
}));

import { resolveItem } from "@/lib/reconciliation/resolver";

describe("mark_intercompany action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.reconciliation.findFirst.mockResolvedValue(null);
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null);
    mockTrackDecision.mockResolvedValue(undefined);
  });

  const link = {
    id: "link_1",
    amount: 5000,
    date: new Date("2026-03-15"),
    concept: "Transferencia intercompañía",
    status: "DETECTED",
    companyAId: "company_1",
    companyBId: "company_2",
    transactionAId: "tx_1",
    transactionBId: null,
    organizationId: "org_1",
  };

  it("confirms intercompany link and reconciles transaction", async () => {
    mockPrisma.intercompanyLink.findUniqueOrThrow.mockResolvedValue(link);
    mockPrisma.intercompanyLink.update.mockResolvedValue({});
    mockPrisma.bankTransaction.update.mockResolvedValue({});
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null); // no counterpart found

    const result = await resolveItem(
      {
        action: "mark_intercompany",
        intercompanyLinkId: "link_1",
        intercompanyAction: "confirm",
      },
      "user_1",
      "company_1"
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("confirmed");

    // Link status updated
    expect(mockPrisma.intercompanyLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "link_1" },
        data: expect.objectContaining({ status: "CONFIRMED" }),
      })
    );

    // Transaction reconciled
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx_1" },
        data: expect.objectContaining({ status: "RECONCILED", detectedType: "INTERCOMPANY" }),
      })
    );

    // Audit log created
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("auto-links counterpart transaction when confirming", async () => {
    const counterpartTx = { id: "tx_2", amount: -5000, companyId: "company_2" };
    mockPrisma.intercompanyLink.findUniqueOrThrow.mockResolvedValue(link);
    mockPrisma.intercompanyLink.update.mockResolvedValue({});
    mockPrisma.bankTransaction.update.mockResolvedValue({});
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(counterpartTx);

    await resolveItem(
      {
        action: "mark_intercompany",
        intercompanyLinkId: "link_1",
        intercompanyAction: "confirm",
      },
      "user_1",
      "company_1"
    );

    // Should link counterpart
    expect(mockPrisma.intercompanyLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ transactionBId: "tx_2" }),
      })
    );

    // Counterpart tx should also be reconciled
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx_2" },
        data: expect.objectContaining({ status: "RECONCILED", detectedType: "INTERCOMPANY" }),
      })
    );
  });

  it("eliminates intercompany link and returns tx to pending", async () => {
    mockPrisma.intercompanyLink.findUniqueOrThrow.mockResolvedValue(link);
    mockPrisma.intercompanyLink.update.mockResolvedValue({});
    mockPrisma.bankTransaction.update.mockResolvedValue({});

    const result = await resolveItem(
      {
        action: "mark_intercompany",
        intercompanyLinkId: "link_1",
        intercompanyAction: "eliminate",
      },
      "user_1",
      "company_1"
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("eliminated");

    // Link eliminated
    expect(mockPrisma.intercompanyLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ELIMINATED" }),
      })
    );

    // Transaction back to PENDING
    expect(mockPrisma.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx_1" },
        data: expect.objectContaining({ status: "PENDING" }),
      })
    );
  });

  it("does not search for counterpart when eliminating", async () => {
    mockPrisma.intercompanyLink.findUniqueOrThrow.mockResolvedValue(link);
    mockPrisma.intercompanyLink.update.mockResolvedValue({});
    mockPrisma.bankTransaction.update.mockResolvedValue({});

    await resolveItem(
      {
        action: "mark_intercompany",
        intercompanyLinkId: "link_1",
        intercompanyAction: "eliminate",
      },
      "user_1",
      "company_1"
    );

    expect(mockPrisma.bankTransaction.findFirst).not.toHaveBeenCalled();
  });

  it("tracks decision in feedback loop", async () => {
    mockPrisma.intercompanyLink.findUniqueOrThrow.mockResolvedValue(link);
    mockPrisma.intercompanyLink.update.mockResolvedValue({});
    mockPrisma.bankTransaction.update.mockResolvedValue({});
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null);

    await resolveItem(
      {
        action: "mark_intercompany",
        intercompanyLinkId: "link_1",
        intercompanyAction: "confirm",
      },
      "user_1",
      "company_1"
    );

    expect(mockTrackDecision).toHaveBeenCalledWith(
      expect.anything(), // db
      expect.objectContaining({
        userId: "user_1",
        companyId: "company_1",
        controllerAction: "mark_intercompany",
      })
    );
  });
});
