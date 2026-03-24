import { describe, it, expect } from "vitest";
import {
  calculateVariations,
  calculateVarPct,
  calculatePctOverRevenue,
} from "@/lib/reports/pyg-generator";

describe("PyG Comparison — calculation helpers", () => {
  it("budget comparison: budgetVar correctly calculated", () => {
    const actual = 12000;
    const budget = 10000;
    const result = calculateVariations(actual, budget);
    expect(result.variance).toBe(2000);
    expect(result.variancePct).toBe(20);
  });

  it("prior year variation percentage calculated correctly", () => {
    const actual = 8000;
    const priorYear = 10000;
    const result = calculateVariations(actual, priorYear);
    expect(result.variance).toBe(-2000);
    // (8000 - 10000) / |10000| * 100 = -20%
    expect(result.variancePct).toBe(-20);
  });

  it("division by zero: comparison = 0 → varPct = null", () => {
    const result = calculateVarPct(5000, 0);
    expect(result).toBeNull();

    const fullResult = calculateVariations(5000, 0);
    expect(fullResult.variance).toBe(5000);
    expect(fullResult.variancePct).toBeNull();
  });

  it("pctOverRevenue: line 1000 with revenue 10000 → 10%", () => {
    const result = calculatePctOverRevenue(1000, 10000);
    expect(result).toBe(10);

    // Also test with zero revenue
    const zeroResult = calculatePctOverRevenue(1000, 0);
    expect(zeroResult).toBeNull();
  });
});
