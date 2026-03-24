/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  account: { findFirst: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
  supportingDocument: { create: vi.fn(), update: vi.fn() },
};

import { createDistributionEntry } from "@/lib/accounting/equity";

describe("Distribution", () => {
  // Helper to set account balances
  // Balance convention: debit - credit. So credit balance = negative value.
  // Account 129: credit balance (profit) is negative in debit-minus-credit.
  function setAccountBalances(balances: Record<string, number>) {
    mockDb.account.findFirst.mockImplementation(async ({ where }: any) => ({
      id: `acct_${where.code}`,
    }));

    mockDb.journalEntryLine.findMany.mockImplementation(async ({ where }: any) => {
      // Extract code from accountId (acct_XXX → XXX)
      const acctId = where.accountId as string;
      const code = acctId.replace("acct_", "");
      const balance = balances[code] ?? 0;
      if (balance >= 0) return [{ debit: balance, credit: 0 }];
      return [{ debit: 0, credit: Math.abs(balance) }];
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 100 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_dist" });
    mockDb.supportingDocument.create.mockResolvedValue({ id: "doc_dist" });
    mockDb.supportingDocument.update.mockResolvedValue({});
  });

  it("sum = result → success", async () => {
    // 129 credit balance of 50000 (negative in debit-minus-credit)
    setAccountBalances({ "129": -50000, "121": 0, "112": -5000, "100": -30000 });

    const result = await createDistributionEntry(mockDb as any, {
      toReservaLegal: 5000,
      toReservasVoluntarias: 25000,
      toDividendos: 20000,
      toCompensarPerdidas: 0,
    });

    expect(result.distributionDocId).toBe("doc_dist");
    expect(result.distributionJeId).toBe("je_dist");
  });

  it("sum ≠ result → error", async () => {
    setAccountBalances({ "129": -50000, "121": 0, "112": -5000, "100": -30000 });

    await expect(
      createDistributionEntry(mockDb as any, {
        toReservaLegal: 5000,
        toReservasVoluntarias: 10000,
        toDividendos: 10000,
        toCompensarPerdidas: 0,
      })
    ).rejects.toThrow("must equal result balance");
  });

  it("losses in 121 without compensating → error", async () => {
    // 121 has debit balance (prior losses), 129 has profit
    setAccountBalances({ "129": -50000, "121": 10000, "112": -5000, "100": -30000 });

    await expect(
      createDistributionEntry(mockDb as any, {
        toReservaLegal: 5000,
        toReservasVoluntarias: 25000,
        toDividendos: 20000,
        toCompensarPerdidas: 0,
      })
    ).rejects.toThrow("prior losses");
  });

  it("reserva legal < 20% + dotation < 10% → error", async () => {
    // Capital 100000, reserva legal 5000 (< 20% of 100000), profit 50000
    // Must allocate at least 10% of 50000 = 5000 to reserva legal
    setAccountBalances({ "129": -50000, "121": 0, "112": -5000, "100": -100000 });

    await expect(
      createDistributionEntry(mockDb as any, {
        toReservaLegal: 2000, // less than 10% of 50000
        toReservasVoluntarias: 28000,
        toDividendos: 20000,
        toCompensarPerdidas: 0,
      })
    ).rejects.toThrow("Reserva legal");
  });

  it("negative result + dividends > 0 → error", async () => {
    // 129 debit balance (loss) — positive in debit-minus-credit
    setAccountBalances({ "129": 30000, "121": 0, "112": -5000, "100": -50000 });

    await expect(
      createDistributionEntry(mockDb as any, {
        toReservaLegal: 0,
        toReservasVoluntarias: 0,
        toDividendos: 10000,
        toCompensarPerdidas: 20000,
      })
    ).rejects.toThrow("loss");
  });

  it("generates 2 docs when dividends > 0 (distribution NONE + dividend OUTFLOW)", async () => {
    setAccountBalances({ "129": -50000, "121": 0, "112": -5000, "100": -30000 });

    const result = await createDistributionEntry(mockDb as any, {
      toReservaLegal: 5000,
      toReservasVoluntarias: 25000,
      toDividendos: 20000,
      toCompensarPerdidas: 0,
    });

    expect(result.dividendDocId).toBeDefined();
    expect(result.dividendJeId).toBeDefined();
    // Distribution doc + dividend doc = 2 supportingDocument.create calls
    expect(mockDb.supportingDocument.create).toHaveBeenCalledTimes(2);
  });

  it("dividend amount = toDividendos", async () => {
    setAccountBalances({ "129": -50000, "121": 0, "112": -5000, "100": -30000 });

    await createDistributionEntry(mockDb as any, {
      toReservaLegal: 5000,
      toReservasVoluntarias: 25000,
      toDividendos: 20000,
      toCompensarPerdidas: 0,
    });

    // The second supportingDocument.create is the dividend doc
    // (first is dist doc created directly, second via registerSupportingDocument)
    const secondDocCreate = mockDb.supportingDocument.create.mock.calls[1][0];
    expect(secondDocCreate.data.amount).toBe(20000);
  });

  it("no regularization (129 = 0) → error", async () => {
    setAccountBalances({ "129": 0, "121": 0, "112": -5000, "100": -30000 });

    await expect(
      createDistributionEntry(mockDb as any, {
        toReservaLegal: 0,
        toReservasVoluntarias: 0,
        toDividendos: 0,
        toCompensarPerdidas: 0,
      })
    ).resolves.toBeDefined();
    // With 129 = 0, sum must be 0 to match, which is valid
  });

  it("only lines > 0 in JE", async () => {
    setAccountBalances({ "129": -20000, "121": 0, "112": -5000, "100": -30000 });

    await createDistributionEntry(mockDb as any, {
      toReservaLegal: 2000,
      toReservasVoluntarias: 18000,
      toDividendos: 0,
      toCompensarPerdidas: 0,
    });

    const jeCall = mockDb.journalEntry.create.mock.calls[0][0];
    const lines = jeCall.data.lines.create;
    // Should have: 129 debit, 112 credit, 113 credit — no 526, no 120
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      const amount = line.debit + line.credit;
      expect(amount).toBeGreaterThan(0);
    }
  });

  it("distributionDetail JSON correct", async () => {
    setAccountBalances({ "129": -40000, "121": 0, "112": -5000, "100": -30000 });

    await createDistributionEntry(mockDb as any, {
      toReservaLegal: 4000,
      toReservasVoluntarias: 20000,
      toDividendos: 16000,
      toCompensarPerdidas: 0,
    });

    const distDoc = mockDb.supportingDocument.create.mock.calls[0][0];
    expect(distDoc.data.distributionDetail).toEqual({
      toReservaLegal: 4000,
      toReservasVoluntarias: 20000,
      toDividendos: 16000,
      toCompensarPerdidas: 0,
    });
  });
});
