/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  account: { findFirst: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
  supportingDocument: { create: vi.fn(), update: vi.fn() },
};

import { createRegularizationEntry } from "@/lib/accounting/equity";

describe("Regularization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default account resolution
    mockDb.account.findFirst.mockImplementation(async ({ where }: any) => ({
      id: `acct_${where.code}`,
    }));

    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 100 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_reg" });
    mockDb.supportingDocument.create.mockResolvedValue({ id: "doc_reg" });
    mockDb.supportingDocument.update.mockResolvedValue({});
  });

  function setupAccounts(accounts: Array<{ code: string; balance: number }>) {
    mockDb.account.findMany.mockResolvedValue(
      accounts.map((a) => ({ id: `acct_${a.code}`, code: a.code }))
    );

    mockDb.journalEntryLine.findMany.mockImplementation(async ({ where }: any) => {
      const acct = accounts.find((a) => `acct_${a.code}` === where.accountId);
      if (!acct) return [];
      // Return a single line that produces the desired balance (debit - credit)
      if (acct.balance >= 0) {
        return [{ debit: acct.balance, credit: 0 }];
      }
      return [{ debit: 0, credit: Math.abs(acct.balance) }];
    });
  }

  it("group 6 accounts zeroed with Haber lines", async () => {
    // Group 6 with debit balance (typical expenses)
    setupAccounts([
      { code: "620", balance: 5000 },
      { code: "640", balance: 8000 },
    ]);

    const result = await createRegularizationEntry(mockDb as any, 2025);

    expect(result.totalExpenses).toBe(13000);
    // The second journalEntry.create call has the detailed lines
    // (first call is from registerSupportingDocument)
    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const lines = jeCall.data.lines.create;
    const acct620 = lines.find((l: any) => l.accountId === "acct_620");
    expect(acct620.credit).toBe(5000);
    expect(acct620.debit).toBe(0);
  });

  it("group 7 accounts zeroed with Debe lines", async () => {
    // Group 7 with credit balance (typical income) — negative in debit-minus-credit
    setupAccounts([
      { code: "700", balance: -20000 },
      { code: "705", balance: -3000 },
    ]);

    const result = await createRegularizationEntry(mockDb as any, 2025);

    expect(result.totalIncome).toBe(23000);
    // The second journalEntry.create call has the detailed lines
    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const lines = jeCall.data.lines.create;
    const acct700 = lines.find((l: any) => l.accountId === "acct_700");
    // balance is -20000 (credit balance) → code: balance < 0 → debit = abs, credit = 0
    expect(acct700.debit).toBe(20000);
    expect(acct700.credit).toBe(0);
  });

  it("counterpart 129 is correct", async () => {
    setupAccounts([
      { code: "640", balance: 5000 },
      { code: "700", balance: -15000 },
    ]);

    const result = await createRegularizationEntry(mockDb as any, 2025);

    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const lines = jeCall.data.lines.create;
    const acct129 = lines.find((l: any) => l.accountId === "acct_129");
    expect(acct129).toBeDefined();
    expect(result.netResult).toBe(10000); // income 15000 - expenses 5000
  });

  it("benefit results in 129 credit", async () => {
    setupAccounts([
      { code: "640", balance: 3000 },
      { code: "700", balance: -10000 },
    ]);

    const result = await createRegularizationEntry(mockDb as any, 2025);

    expect(result.netResult).toBe(7000); // profit
    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const acct129 = jeCall.data.lines.create.find((l: any) => l.accountId === "acct_129");
    expect(acct129.credit).toBe(7000);
    expect(acct129.debit).toBe(0);
  });

  it("loss results in 129 debit", async () => {
    setupAccounts([
      { code: "640", balance: 15000 },
      { code: "700", balance: -5000 },
    ]);

    const result = await createRegularizationEntry(mockDb as any, 2025);

    expect(result.netResult).toBe(-10000); // loss
    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const acct129 = jeCall.data.lines.create.find((l: any) => l.accountId === "acct_129");
    expect(acct129.debit).toBe(10000);
    expect(acct129.credit).toBe(0);
  });

  it("JE balances (Debe = Haber)", async () => {
    setupAccounts([
      { code: "620", balance: 4000 },
      { code: "640", balance: 6000 },
      { code: "700", balance: -18000 },
    ]);

    await createRegularizationEntry(mockDb as any, 2025);

    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const lines = jeCall.data.lines.create;
    const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("zero-balance accounts do not generate lines", async () => {
    setupAccounts([
      { code: "620", balance: 0 },
      { code: "700", balance: -10000 },
    ]);

    await createRegularizationEntry(mockDb as any, 2025);

    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    const lines = jeCall.data.lines.create;
    // Should not have a line for 620 (balance 0)
    const acct620 = lines.find((l: any) => l.accountId === "acct_620");
    expect(acct620).toBeUndefined();
  });

  it("doc type is ACTA_JUNTA and direction is NONE", async () => {
    setupAccounts([{ code: "640", balance: 5000 }]);

    await createRegularizationEntry(mockDb as any, 2025);

    const docCreate = mockDb.supportingDocument.create.mock.calls[0][0];
    expect(docCreate.data.type).toBe("ACTA_JUNTA");
    expect(docCreate.data.expectedDirection).toBe("NONE");
  });

  it("JE has status DRAFT", async () => {
    setupAccounts([{ code: "700", balance: -5000 }]);

    await createRegularizationEntry(mockDb as any, 2025);

    const jeCall = mockDb.journalEntry.create.mock.calls[1][0];
    expect(jeCall.data.status).toBe("DRAFT");
  });
});
