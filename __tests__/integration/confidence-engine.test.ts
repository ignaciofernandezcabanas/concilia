import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateConfidence, type ConfidenceContext } from "@/lib/ai/confidence-engine";
import { calibrateFromDecision, getPatternAdjustment, isCategoryPaused, resetPatternErrors } from "@/lib/ai/confidence-calibrator";

function ctx(overrides: Partial<ConfidenceContext> = {}): ConfidenceContext {
  return {
    category: "exact_match",
    threshold: 0.95,
    companyId: "c1",
    ...overrides,
  };
}

describe("Confidence Engine", () => {
  // ── exact_match ──
  describe("exact_match", () => {
    it("historial >10 → ≥0.97", () => {
      const r = calculateConfidence(ctx({ historicalMatchCount: 15 }));
      expect(r.score).toBeGreaterThanOrEqual(0.97);
      expect(r.autoExecute).toBe(true);
    });

    it("primera vez → ≤0.92", () => {
      const r = calculateConfidence(ctx({ isFirstTime: true }));
      expect(r.score).toBeLessThanOrEqual(0.92);
      expect(r.autoExecute).toBe(false);
    });

    it("materialidad alta → -0.03", () => {
      const r1 = calculateConfidence(ctx({ historicalMatchCount: 15 }));
      const r2 = calculateConfidence(ctx({
        historicalMatchCount: 15,
        amount: 10000,
        materialityThreshold: 5000,
      }));
      expect(r2.score).toBe(r1.score - 0.03);
    });
  });

  // ── recurring_variable ──
  describe("recurring_variable", () => {
    it("dentro 2σ → ≥0.95", () => {
      const r = calculateConfidence(ctx({
        category: "recurring_variable",
        amountZScore: 1.5,
      }));
      expect(r.score).toBeGreaterThanOrEqual(0.95);
    });

    it("fuera 3σ → <0.75", () => {
      const r = calculateConfidence(ctx({
        category: "recurring_variable",
        amountZScore: 3.5,
      }));
      expect(r.score).toBeLessThan(0.75);
    });
  });

  // ── llm_classification ──
  describe("llm_classification", () => {
    it("checks pasan → score = llmConf", () => {
      const r = calculateConfidence(ctx({
        category: "llm_classification",
        llmConfidence: 0.80,
        systemCheckMultiplier: 1.0,
      }));
      expect(r.score).toBe(0.80);
    });

    it("1 check falla → ×0.85", () => {
      const r = calculateConfidence(ctx({
        category: "llm_classification",
        llmConfidence: 0.80,
        systemCheckMultiplier: 0.85,
      }));
      expect(r.score).toBe(0.68);
    });
  });

  // ── rule_application ──
  describe("rule_application", () => {
    it("0% errores → ~0.98", () => {
      const r = calculateConfidence(ctx({
        category: "rule_application",
        ruleErrorRate: 0.0,
      }));
      expect(r.score).toBeGreaterThanOrEqual(0.97);
    });

    it("12% errores → ≤0.82", () => {
      const r = calculateConfidence(ctx({
        category: "rule_application",
        ruleErrorRate: 0.12,
      }));
      expect(r.score).toBeLessThanOrEqual(0.82);
    });
  });

  // ── amortization ──
  describe("amortization", () => {
    it("≥3 meses → auto", () => {
      const r = calculateConfidence(ctx({
        category: "amortization",
        monthsApproved: 5,
      }));
      expect(r.score).toBe(1.0);
      expect(r.autoExecute).toBe(true);
    });

    it("<3 meses → no auto", () => {
      const r = calculateConfidence(ctx({
        category: "amortization",
        monthsApproved: 1,
      }));
      expect(r.score).toBe(0.85);
      expect(r.autoExecute).toBe(false);
    });
  });

  // ── periodification ──
  describe("periodification", () => {
    it("cualquier contexto → autoExecute SIEMPRE false", () => {
      const r = calculateConfidence(ctx({
        category: "periodification",
        threshold: 0.50, // very low threshold
      }));
      expect(r.autoExecute).toBe(false);
    });
  });

  // ── internal_transfer ──
  describe("internal_transfer", () => {
    it("siempre → 1.0 auto", () => {
      const r = calculateConfidence(ctx({
        category: "internal_transfer",
      }));
      expect(r.score).toBe(1.0);
      expect(r.autoExecute).toBe(true);
    });
  });

  // ── manual_journal ──
  describe("manual_journal", () => {
    it("siempre → autoExecute false", () => {
      const r = calculateConfidence(ctx({
        category: "manual_journal",
        threshold: 0.0,
      }));
      expect(r.autoExecute).toBe(false);
    });
  });

  // ── intercompany_exact ──
  describe("intercompany_exact", () => {
    it("misma fecha → 1.0", () => {
      const r = calculateConfidence(ctx({
        category: "intercompany_exact",
        dateDiffDays: 0,
      }));
      expect(r.score).toBe(1.0);
    });

    it("fecha diff >3d → 0.85", () => {
      const r = calculateConfidence(ctx({
        category: "intercompany_exact",
        dateDiffDays: 4,
      }));
      expect(r.score).toBe(0.85);
    });
  });

  // ── difference_match ──
  describe("difference_match", () => {
    it("descuento frecuente → sube", () => {
      const r = calculateConfidence(ctx({
        category: "difference_match",
        discountFrequency: 0.8,
      }));
      expect(r.score).toBeGreaterThan(0.90);
    });

    it("descuento atípico → baja", () => {
      const r = calculateConfidence(ctx({
        category: "difference_match",
        isAtypical: true,
      }));
      expect(r.score).toBeLessThan(0.80);
    });
  });
});

describe("Confidence Calibrator", () => {
  beforeEach(() => {
    resetPatternErrors("c1", "exact_match", "p1");
    resetPatternErrors("c1", "exact_match");
  });

  it("error auto-execute → baja 0.10", async () => {
    await calibrateFromDecision({
      wasAutoExecuted: true,
      wasModified: true,
      category: "exact_match",
      patternKey: "p1",
      companyId: "c1",
    });

    const adj = getPatternAdjustment("c1", "exact_match", "p1");
    expect(adj).toBe(-0.10);
  });

  it("aprobado sin cambio → sube 0.01", async () => {
    await calibrateFromDecision({
      wasAutoExecuted: false,
      wasModified: false,
      category: "exact_match",
      patternKey: "p1",
      companyId: "c1",
    });

    const adj = getPatternAdjustment("c1", "exact_match", "p1");
    expect(adj).toBe(0.01);
  });

  it("2 errores en 30 días → pausa categoría", async () => {
    await calibrateFromDecision({
      wasAutoExecuted: true, wasModified: true,
      category: "exact_match", patternKey: "p1", companyId: "c1",
    });
    await calibrateFromDecision({
      wasAutoExecuted: true, wasModified: true,
      category: "exact_match", patternKey: "p1", companyId: "c1",
    });

    expect(isCategoryPaused("c1", "exact_match")).toBe(true);
  });
});
