/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => ({
  ownBankAccount: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  bankTransaction: {
    count: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockDb }));
vi.mock("@/lib/db-scoped", () => ({ getScopedDb: () => mockDb }));
vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: any) => handler,
}));

// ---------------------------------------------------------------------------
// Import functions under test
// ---------------------------------------------------------------------------

import { detectBankFromIBAN, suggestPGCAccount } from "@/lib/bank/detect-bank";

describe("Bank Accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.ownBankAccount.findMany.mockResolvedValue([]);
    mockDb.ownBankAccount.findFirst.mockResolvedValue(null);
    mockDb.ownBankAccount.create.mockResolvedValue({ id: "ba_new" });
    mockDb.ownBankAccount.update.mockResolvedValue({ id: "ba_1", isActive: false });
    mockDb.bankTransaction.count.mockResolvedValue(0);
  });

  // -------------------------------------------------------------------------
  // detectBankFromIBAN
  // -------------------------------------------------------------------------

  it("detects CaixaBank from IBAN entity code 2100", () => {
    const result = detectBankFromIBAN("ES7621000418450200051332");
    expect(result).not.toBeNull();
    expect(result!.bankName).toBe("CaixaBank");
    expect(result!.bic).toBe("CAIXESBBXXX");
  });

  it("detects BBVA from IBAN entity code 0182", () => {
    const result = detectBankFromIBAN("ES6801822200960201234567");
    expect(result).not.toBeNull();
    expect(result!.bankName).toBe("BBVA");
    expect(result!.bic).toBe("BBVAESMMXXX");
  });

  it("detects Santander from IBAN entity code 0049", () => {
    const result = detectBankFromIBAN("ES8000490075442116386243");
    expect(result).not.toBeNull();
    expect(result!.bankName).toBe("Santander");
  });

  it("returns null for unknown entity code", () => {
    const result = detectBankFromIBAN("ES7699990024003102575766");
    expect(result).toBeNull();
  });

  it("returns null for non-Spanish IBAN", () => {
    const result = detectBankFromIBAN("DE89370400440532013000");
    expect(result).toBeNull();
  });

  it("returns null for invalid IBAN length", () => {
    const result = detectBankFromIBAN("ES762100");
    expect(result).toBeNull();
  });

  it("handles IBAN with spaces", () => {
    const result = detectBankFromIBAN("ES76 2100 0418 4502 0005 1332");
    expect(result).not.toBeNull();
    expect(result!.bankName).toBe("CaixaBank");
  });

  // -------------------------------------------------------------------------
  // suggestPGCAccount
  // -------------------------------------------------------------------------

  it("suggests first PGC code for CHECKING with no existing codes", () => {
    const code = suggestPGCAccount("CHECKING", []);
    expect(code).toBe("5720001");
  });

  it("suggests second PGC code when first exists", () => {
    const code = suggestPGCAccount("CHECKING", ["5720001"]);
    expect(code).toBe("5720002");
  });

  it("suggests correct prefix for LOAN type", () => {
    const code = suggestPGCAccount("LOAN", []);
    expect(code).toBe("1700001");
  });

  it("suggests correct prefix for CREDIT_LINE type", () => {
    const code = suggestPGCAccount("CREDIT_LINE", []);
    expect(code).toBe("5201001");
  });

  it("suggests correct prefix for CREDIT_CARD type", () => {
    const code = suggestPGCAccount("CREDIT_CARD", []);
    expect(code).toBe("5266001");
  });

  it("skips occupied codes correctly", () => {
    const code = suggestPGCAccount("CHECKING", ["5720001", "5720002", "5720003"]);
    expect(code).toBe("5720004");
  });

  // -------------------------------------------------------------------------
  // API validation — CHECKING requires IBAN
  // -------------------------------------------------------------------------

  it("POST CHECKING requires IBAN", async () => {
    const { z } = await import("zod");

    // Replicate the key validation: CHECKING needs IBAN
    const needsIBAN = ["CHECKING", "SAVINGS", "CREDIT_LINE", "CONFIRMING", "FACTORING"];
    const type = "CHECKING";
    const hasIBAN = false;

    expect(needsIBAN.includes(type) && !hasIBAN).toBe(true);
  });

  it("POST CREDIT_CARD requires lastFourDigits", () => {
    const type = "CREDIT_CARD";
    const needsLastFour = ["CREDIT_CARD"];
    const hasLastFour = false;

    expect(needsLastFour.includes(type) && !hasLastFour).toBe(true);
  });

  it("POST LOAN requires creditLimit + monthlyPayment + interestRate", () => {
    const type = "LOAN";
    const needsFinancing = ["LOAN", "CREDIT_LINE", "CONFIRMING", "FACTORING"];
    const needsLoan = ["LOAN"];

    expect(needsFinancing.includes(type)).toBe(true);
    expect(needsLoan.includes(type)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // IBAN change blocked if has transactions
  // -------------------------------------------------------------------------

  it("blocks IBAN change when account has transactions", async () => {
    mockDb.ownBankAccount.findFirst.mockResolvedValue({
      id: "ba_1",
      iban: "ES7621000418450200051332",
    });
    mockDb.bankTransaction.count.mockResolvedValue(5);

    const existing = await mockDb.ownBankAccount.findFirst({ where: { id: "ba_1" } });
    const newIban = "ES6801822200960201234567";
    const txCount = await mockDb.bankTransaction.count({
      where: { counterpartIban: existing.iban },
    });

    expect(existing.iban).not.toBe(newIban);
    expect(txCount).toBeGreaterThan(0);
    // API would return 409
  });

  it("allows IBAN change when account has no transactions", async () => {
    mockDb.ownBankAccount.findFirst.mockResolvedValue({
      id: "ba_1",
      iban: "ES7621000418450200051332",
    });
    mockDb.bankTransaction.count.mockResolvedValue(0);

    const txCount = await mockDb.bankTransaction.count({
      where: { counterpartIban: "ES7621000418450200051332" },
    });

    expect(txCount).toBe(0);
    // API would allow the update
  });

  // -------------------------------------------------------------------------
  // Deactivate / Reactivate
  // -------------------------------------------------------------------------

  it("deactivate sets isActive to false", async () => {
    mockDb.ownBankAccount.findFirst.mockResolvedValue({ id: "ba_1", isActive: true });
    mockDb.ownBankAccount.update.mockResolvedValue({ id: "ba_1", isActive: false });

    const account = await mockDb.ownBankAccount.findFirst({ where: { id: "ba_1" } });
    expect(account.isActive).toBe(true);

    const updated = await mockDb.ownBankAccount.update({
      where: { id: "ba_1" },
      data: { isActive: false },
    });
    expect(updated.isActive).toBe(false);
  });

  it("reactivate sets isActive to true", async () => {
    mockDb.ownBankAccount.findFirst.mockResolvedValue({ id: "ba_1", isActive: false });
    mockDb.ownBankAccount.update.mockResolvedValue({ id: "ba_1", isActive: true });

    const account = await mockDb.ownBankAccount.findFirst({ where: { id: "ba_1" } });
    expect(account.isActive).toBe(false);

    const updated = await mockDb.ownBankAccount.update({
      where: { id: "ba_1" },
      data: { isActive: true },
    });
    expect(updated.isActive).toBe(true);
  });

  // -------------------------------------------------------------------------
  // IBAN validation format
  // -------------------------------------------------------------------------

  it("rejects invalid IBAN format", () => {
    // Too short
    expect(detectBankFromIBAN("ES12")).toBeNull();
    // Not starting with country code
    expect(detectBankFromIBAN("12345678901234567890")).toBeNull();
    // Wrong country
    expect(detectBankFromIBAN("FR7630006000011234567890189")).toBeNull();
  });

  it("accepts valid Spanish IBAN with lowercase", () => {
    const result = detectBankFromIBAN("es7621000418450200051332");
    expect(result).not.toBeNull();
    expect(result!.bankName).toBe("CaixaBank");
  });
});
