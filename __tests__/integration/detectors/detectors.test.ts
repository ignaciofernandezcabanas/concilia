import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBankTransaction, buildMatchingRule } from "../../helpers/factories";

// ── Shared mock ──
const mockPrisma = vi.hoisted(() => ({
  ownBankAccount: { findFirst: vi.fn() },
  bankTransaction: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  duplicateGroup: { create: vi.fn() },
  matchingRule: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { detectInternalTransfer } from "@/lib/reconciliation/detectors/internal-detector";
import { detectDuplicates } from "@/lib/reconciliation/detectors/duplicate-detector";
import { detectReturn } from "@/lib/reconciliation/detectors/return-detector";
import { detectFinancialOp } from "@/lib/reconciliation/detectors/financial-detector";

// ════════════════════════════════════════════════════════════
// Internal Transfer Detector
// ════════════════════════════════════════════════════════════

describe("detectInternalTransfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("IBAN en OwnBankAccount → isInternal: true", async () => {
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue({
      id: "own_1",
      iban: "ES7620770024003102575766",
    });
    const tx = buildBankTransaction();
    const result = await detectInternalTransfer(tx, mockPrisma as any);
    expect(result.isInternal).toBe(true);
    expect(result.ownAccountId).toBe("own_1");
  });

  it("IBAN no en OwnBankAccount → false", async () => {
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue(null);
    const tx = buildBankTransaction();
    const result = await detectInternalTransfer(tx, mockPrisma as any);
    expect(result.isInternal).toBe(false);
  });

  it("sin IBAN → false, no llama a prisma", async () => {
    const tx = buildBankTransaction({ counterpartIban: null });
    const result = await detectInternalTransfer(tx, mockPrisma as any);
    expect(result.isInternal).toBe(false);
    expect(mockPrisma.ownBankAccount.findFirst).not.toHaveBeenCalled();
  });

  it("normaliza IBAN con espacios", async () => {
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue({ id: "own_1" });
    const tx = buildBankTransaction({ counterpartIban: "ES76 2077 0024 0031 0257 5766" });
    await detectInternalTransfer(tx, mockPrisma as any);
    expect(mockPrisma.ownBankAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ iban: "ES7620770024003102575766" }),
      })
    );
  });
});

// ════════════════════════════════════════════════════════════
// Duplicate Detector
// ════════════════════════════════════════════════════════════

describe("detectDuplicates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mismo importe + IBAN + fecha cercana → isDuplicate: true", async () => {
    const dup = buildBankTransaction({ id: "tx_dup", valueDate: new Date("2026-03-14") });
    mockPrisma.bankTransaction.findMany.mockResolvedValue([dup]);
    mockPrisma.duplicateGroup.create.mockResolvedValue({ id: "group_1" });

    const tx = buildBankTransaction({ valueDate: new Date("2026-03-15") });
    const result = await detectDuplicates(tx, mockPrisma as any);
    expect(result.isDuplicate).toBe(true);
    expect(result.groupId).toBe("group_1");
  });

  it("IBAN diferente → false", async () => {
    const dup = buildBankTransaction({ id: "tx_dup", counterpartIban: "ES0000000000000000000000" });
    mockPrisma.bankTransaction.findMany.mockResolvedValue([dup]);

    const tx = buildBankTransaction();
    const result = await detectDuplicates(tx, mockPrisma as any);
    expect(result.isDuplicate).toBe(false);
  });

  it("sin candidatos → false", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
    const tx = buildBankTransaction();
    const result = await detectDuplicates(tx, mockPrisma as any);
    expect(result.isDuplicate).toBe(false);
  });

  it("ambos sin IBAN pero mismo concepto → true", async () => {
    const dup = buildBankTransaction({
      id: "tx_dup",
      counterpartIban: null,
      concept: "COMISION MANTENIMIENTO",
    });
    mockPrisma.bankTransaction.findMany.mockResolvedValue([dup]);
    mockPrisma.duplicateGroup.create.mockResolvedValue({ id: "group_1" });

    const tx = buildBankTransaction({ counterpartIban: null, concept: "COMISION MANTENIMIENTO" });
    const result = await detectDuplicates(tx, mockPrisma as any);
    expect(result.isDuplicate).toBe(true);
  });

  it("ambos sin IBAN y concepto diferente → false", async () => {
    const dup = buildBankTransaction({
      id: "tx_dup",
      counterpartIban: null,
      concept: "OTRO CONCEPTO",
    });
    mockPrisma.bankTransaction.findMany.mockResolvedValue([dup]);

    const tx = buildBankTransaction({ counterpartIban: null, concept: "COMISION MANTENIMIENTO" });
    const result = await detectDuplicates(tx, mockPrisma as any);
    expect(result.isDuplicate).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Return Detector
// ════════════════════════════════════════════════════════════

describe("detectReturn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tx inversa reconciliada del mismo IBAN en últimos 30 días → isReturn: true", async () => {
    const original = buildBankTransaction({
      id: "tx_orig",
      amount: 1000, // original was positive
      status: "RECONCILED",
      reconciliations: [{ id: "reco_1", status: "APPROVED" }],
    });
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(original);

    const tx = buildBankTransaction({ amount: -1000 }); // inverse
    const result = await detectReturn(tx, mockPrisma as any);
    expect(result.isReturn).toBe(true);
    expect(result.originalTxId).toBe("tx_orig");
  });

  it("sin IBAN → false", async () => {
    const tx = buildBankTransaction({ counterpartIban: null });
    const result = await detectReturn(tx, mockPrisma as any);
    expect(result.isReturn).toBe(false);
    expect(mockPrisma.bankTransaction.findFirst).not.toHaveBeenCalled();
  });

  it("tx original no reconciliada → false", async () => {
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null);
    const tx = buildBankTransaction({ amount: -1000 });
    const result = await detectReturn(tx, mockPrisma as any);
    expect(result.isReturn).toBe(false);
  });

  it("busca con importe inverso y mismo IBAN normalizado", async () => {
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null);
    const tx = buildBankTransaction({ amount: -500, counterpartIban: "es76 2077 0024" });
    await detectReturn(tx, mockPrisma as any);

    const call = mockPrisma.bankTransaction.findFirst.mock.calls[0][0].where;
    expect(call.amount).toBe(500); // inverse of -500
    expect(call.counterpartIban).toBe("ES7620770024"); // normalized
    expect(call.status).toBe("RECONCILED");
  });
});

// ════════════════════════════════════════════════════════════
// Financial Detector
// ════════════════════════════════════════════════════════════

describe("detectFinancialOp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tx positiva → isFinancial: false", async () => {
    const tx = buildBankTransaction({ amount: 1000 });
    const result = await detectFinancialOp(tx, mockPrisma as any);
    expect(result.isFinancial).toBe(false);
  });

  it("sin IBAN → false", async () => {
    const tx = buildBankTransaction({ amount: -500, counterpartIban: null });
    const result = await detectFinancialOp(tx, mockPrisma as any);
    expect(result.isFinancial).toBe(false);
  });

  it("3+ pagos mensuales similares del mismo IBAN → true", async () => {
    const historical = [
      buildBankTransaction({ id: "h1", amount: -500, valueDate: new Date("2025-12-15") }),
      buildBankTransaction({ id: "h2", amount: -500, valueDate: new Date("2026-01-15") }),
      buildBankTransaction({ id: "h3", amount: -500, valueDate: new Date("2026-02-15") }),
    ];
    mockPrisma.bankTransaction.findMany.mockResolvedValue(historical);
    mockPrisma.matchingRule.findFirst.mockResolvedValue(null);

    const tx = buildBankTransaction({ amount: -500, valueDate: new Date("2026-03-15") });
    const result = await detectFinancialOp(tx, mockPrisma as any);
    expect(result.isFinancial).toBe(true);
  });

  it("solo 1 pago histórico → false", async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      buildBankTransaction({ id: "h1", amount: -500, valueDate: new Date("2026-02-15") }),
    ]);

    const tx = buildBankTransaction({ amount: -500 });
    const result = await detectFinancialOp(tx, mockPrisma as any);
    expect(result.isFinancial).toBe(false);
  });

  it("split sin regla → default 85/15", async () => {
    const historical = [
      buildBankTransaction({ id: "h1", amount: -1000, valueDate: new Date("2025-12-15") }),
      buildBankTransaction({ id: "h2", amount: -1000, valueDate: new Date("2026-01-15") }),
      buildBankTransaction({ id: "h3", amount: -1000, valueDate: new Date("2026-02-15") }),
    ];
    mockPrisma.bankTransaction.findMany.mockResolvedValue(historical);
    mockPrisma.matchingRule.findFirst.mockResolvedValue(null);

    const tx = buildBankTransaction({ amount: -1000, valueDate: new Date("2026-03-15") });
    const result = await detectFinancialOp(tx, mockPrisma as any);
    expect(result.suggestedPrincipal).toBe(850);
    expect(result.suggestedInterest).toBe(150);
  });

  it("split con regla FINANCIAL_SPLIT → usa porcentajes de la regla", async () => {
    const historical = [
      buildBankTransaction({ id: "h1", amount: -1000, valueDate: new Date("2025-12-15") }),
      buildBankTransaction({ id: "h2", amount: -1000, valueDate: new Date("2026-01-15") }),
    ];
    mockPrisma.bankTransaction.findMany.mockResolvedValue(historical);
    mockPrisma.matchingRule.findFirst.mockResolvedValue(
      buildMatchingRule({
        type: "FINANCIAL_SPLIT",
        action: '{"principalPct": 0.90, "interestPct": 0.10}',
      })
    );

    const tx = buildBankTransaction({ amount: -1000, valueDate: new Date("2026-03-15") });
    const result = await detectFinancialOp(tx, mockPrisma as any);
    expect(result.suggestedPrincipal).toBe(900);
    expect(result.suggestedInterest).toBe(100);
  });
});
