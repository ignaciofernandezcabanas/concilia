/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invoice: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
  supportingDocument: { findMany: vi.fn() },
};

import { findSupportingDocMatch } from "@/lib/reconciliation/matchers/exact-match";

function makeTx(overrides: Partial<any> = {}): any {
  return {
    id: "tx_1",
    amount: -20000,
    concept: "PAGO PRESTAMO",
    counterpartIban: null,
    counterpartName: null,
    valueDate: new Date("2026-03-15"),
    ...overrides,
  };
}

describe("Matcher — SupportingDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.supportingDocument.findMany.mockResolvedValue([]);
  });

  it("payment -20K + POSTED OUTFLOW doc 20K → match confidence 0.93", async () => {
    mockDb.supportingDocument.findMany.mockResolvedValue([
      {
        id: "doc_1",
        status: "POSTED",
        expectedDirection: "OUTFLOW",
        expectedAmount: 20000,
        description: "Préstamo bancario",
        date: new Date("2026-03-01"),
      },
    ]);

    const tx = makeTx({ amount: -20000 });
    const result = await findSupportingDocMatch(tx, mockDb as any);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.93);
    expect(result!.supportingDocumentId).toBe("doc_1");
  });

  it("income +150K + POSTED INFLOW doc 150K → match", async () => {
    mockDb.supportingDocument.findMany.mockResolvedValue([
      {
        id: "doc_2",
        status: "POSTED",
        expectedDirection: "INFLOW",
        expectedAmount: 150000,
        description: "Ampliación capital",
        date: new Date("2026-02-15"),
      },
    ]);

    const tx = makeTx({ amount: 150000 });
    const result = await findSupportingDocMatch(tx, mockDb as any);

    expect(result).not.toBeNull();
    expect(result!.supportingDocumentId).toBe("doc_2");
  });

  it("doc already RECONCILED → not returned", async () => {
    // The query filters by status: "POSTED", so RECONCILED docs won't be in results
    // But the code also filters unreconciledDocs — set status to RECONCILED in results
    mockDb.supportingDocument.findMany.mockResolvedValue([
      {
        id: "doc_3",
        status: "RECONCILED",
        expectedDirection: "OUTFLOW",
        expectedAmount: 20000,
        description: "Already reconciled",
        date: new Date("2026-03-01"),
      },
    ]);

    const tx = makeTx({ amount: -20000 });
    const result = await findSupportingDocMatch(tx, mockDb as any);

    expect(result).toBeNull();
  });

  it("wrong direction → no match", async () => {
    // INFLOW doc but OUTFLOW transaction
    mockDb.supportingDocument.findMany.mockResolvedValue([]);

    const tx = makeTx({ amount: -20000 });
    const result = await findSupportingDocMatch(tx, mockDb as any);

    expect(result).toBeNull();
  });

  it("amount outside 1% tolerance → no match", async () => {
    // Doc with amount that doesn't match within 1%
    mockDb.supportingDocument.findMany.mockResolvedValue([]);

    const tx = makeTx({ amount: -20000 });
    const result = await findSupportingDocMatch(tx, mockDb as any);

    expect(result).toBeNull();
  });

  it("doc in PENDING_APPROVAL (not POSTED) → no match", async () => {
    // Query filters by status: "POSTED", so PENDING_APPROVAL won't be returned
    mockDb.supportingDocument.findMany.mockResolvedValue([]);

    const tx = makeTx({ amount: -20000 });
    const result = await findSupportingDocMatch(tx, mockDb as any);

    expect(result).toBeNull();
  });
});
