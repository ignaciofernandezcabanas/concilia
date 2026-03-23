import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBankTransaction } from "../helpers/factories";

// Mock rule classifier
const mockClassifyByRules = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reconciliation/classifiers/rule-classifier", () => ({
  classifyByRules: mockClassifyByRules,
}));

// Mock model router
const mockCallAIJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/model-router", () => ({
  callAIJson: mockCallAIJson,
}));

// Mock confidence engine — use real calculateConfidence but mock runSystemChecks
const mockRunSystemChecks = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/confidence-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/confidence-engine")>("@/lib/ai/confidence-engine");
  return {
    ...actual,
    runSystemChecks: mockRunSystemChecks,
  };
});

// Mock context retriever
vi.mock("@/lib/ai/context-retriever", () => ({
  getRelevantContext: vi.fn().mockResolvedValue({ sameCounterpart: [], similarConcept: [], activePatterns: [], totalFound: 0 }),
  formatContextForPrompt: vi.fn().mockReturnValue(""),
}));

// Mock prisma for ScopedPrisma
const mockDb = {
  bankTransaction: { findMany: vi.fn() },
  account: { findFirst: vi.fn() },
  controllerDecision: { findMany: vi.fn() },
  learnedPattern: { findMany: vi.fn() },
};

import { classifyWithCascade } from "@/lib/ai/cascade";

describe("Classification Cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
    mockRunSystemChecks.mockResolvedValue({ allPassed: true, failed: [], multiplier: 1.0 });
  });

  const tx = buildBankTransaction({ amount: -150, concept: "RECIBO LUZ ENDESA" });

  it("tx con regla activa → deterministic, 0 llamadas AI", async () => {
    mockClassifyByRules.mockResolvedValue({
      accountCode: "628",
      cashflowType: "OPERATING",
      ruleId: "r1",
      confidence: 0.95,
      ruleName: "IBAN_CLASSIFY:ES...",
    });

    const result = await classifyWithCascade(tx, mockDb as any, 0.90);

    expect(result.resolvedBy).toBe("deterministic");
    expect(result.accountCode).toBe("628");
    expect(mockCallAIJson).not.toHaveBeenCalled();
  });

  it("tx sin regla, Haiku seguro → haiku", async () => {
    mockClassifyByRules.mockResolvedValue(null);
    mockCallAIJson.mockResolvedValueOnce({
      accountCode: "628",
      accountName: "Suministros",
      cashflowType: "OPERATING",
      confidence: 0.90,
      reasoning: "Suministro eléctrico",
    });

    const result = await classifyWithCascade(tx, mockDb as any, 0.85);

    expect(result.resolvedBy).toBe("haiku");
    expect(result.accountCode).toBe("628");
    // callAIJson called once (Haiku), not twice
    expect(mockCallAIJson).toHaveBeenCalledTimes(1);
  });

  it("tx sin regla, Haiku inseguro → escala a Sonnet", async () => {
    mockClassifyByRules.mockResolvedValue(null);

    // Haiku: low confidence
    mockCallAIJson.mockResolvedValueOnce({
      accountCode: "629",
      accountName: "Otros servicios",
      cashflowType: "OPERATING",
      confidence: 0.55,
      reasoning: "Poco seguro",
    });
    // Sonnet: higher confidence
    mockCallAIJson.mockResolvedValueOnce({
      accountCode: "628",
      accountName: "Suministros",
      cashflowType: "OPERATING",
      confidence: 0.82,
      reasoning: "Suministro eléctrico Endesa",
    });

    const result = await classifyWithCascade(tx, mockDb as any, 0.80);

    expect(result.resolvedBy).toBe("sonnet");
    expect(result.accountCode).toBe("628");
    expect(mockCallAIJson).toHaveBeenCalledTimes(2);
  });

  it("Haiku propone cuenta inexistente → check falla → escala", async () => {
    mockClassifyByRules.mockResolvedValue(null);

    // Haiku: proposes non-existent account
    mockCallAIJson.mockResolvedValueOnce({
      accountCode: "999",
      accountName: "Inventada",
      cashflowType: "OPERATING",
      confidence: 0.90,
      reasoning: "test",
    });
    // System checks fail for Haiku
    mockRunSystemChecks
      .mockResolvedValueOnce({ allPassed: false, failed: ["account_exists"], multiplier: 0.85 })
      // Sonnet: valid account, checks pass
      .mockResolvedValueOnce({ allPassed: true, failed: [], multiplier: 1.0 });

    mockCallAIJson.mockResolvedValueOnce({
      accountCode: "628",
      accountName: "Suministros",
      cashflowType: "OPERATING",
      confidence: 0.88,
      reasoning: "Correcto",
    });

    const result = await classifyWithCascade(tx, mockDb as any, 0.80);

    expect(result.resolvedBy).toBe("sonnet");
    expect(mockCallAIJson).toHaveBeenCalledTimes(2);
  });

  it("Sonnet también inseguro → unresolved", async () => {
    mockClassifyByRules.mockResolvedValue(null);

    // Haiku: null
    mockCallAIJson.mockResolvedValueOnce(null);
    // Sonnet: null
    mockCallAIJson.mockResolvedValueOnce(null);

    const result = await classifyWithCascade(tx, mockDb as any, 0.90);

    expect(result.resolvedBy).toBe("unresolved");
    expect(result.accountCode).toBeNull();
  });

  it("nivel 2 NO se ejecuta si nivel 1 resolvió", async () => {
    mockClassifyByRules.mockResolvedValue({
      accountCode: "628",
      cashflowType: "OPERATING",
      ruleId: "r1",
      confidence: 0.95,
      ruleName: "test",
    });

    await classifyWithCascade(tx, mockDb as any, 0.90);

    expect(mockCallAIJson).not.toHaveBeenCalled();
    expect(mockDb.bankTransaction.findMany).not.toHaveBeenCalled();
  });

  it("nivel 3 NO se ejecuta si nivel 2 resolvió", async () => {
    mockClassifyByRules.mockResolvedValue(null);
    mockCallAIJson.mockResolvedValueOnce({
      accountCode: "628",
      accountName: "Suministros",
      cashflowType: "OPERATING",
      confidence: 0.92,
      reasoning: "Seguro",
    });

    const result = await classifyWithCascade(tx, mockDb as any, 0.80);

    expect(result.resolvedBy).toBe("haiku");
    // Only 1 call (Haiku), not 2
    expect(mockCallAIJson).toHaveBeenCalledTimes(1);
  });
});
