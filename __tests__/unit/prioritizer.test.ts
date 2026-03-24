import { describe, it, expect } from "vitest";
import { assignPriority } from "@/lib/reconciliation/prioritizer";

describe("assignPriority", () => {
  const materiality = 500;

  // ── URGENT ──
  describe("URGENT", () => {
    it("POSSIBLE_DUPLICATE siempre es URGENT con confidence alta", () => {
      expect(assignPriority({ amount: 100 }, "POSSIBLE_DUPLICATE", 0.99, materiality)).toBe(
        "URGENT"
      );
    });

    it("POSSIBLE_DUPLICATE siempre es URGENT con confidence baja", () => {
      expect(assignPriority({ amount: 100 }, "POSSIBLE_DUPLICATE", 0.5, materiality)).toBe(
        "URGENT"
      );
    });

    it("RETURN siempre es URGENT", () => {
      expect(assignPriority({ amount: -500 }, "RETURN", 0.95, materiality)).toBe("URGENT");
    });
  });

  // ── DECISION ──
  describe("DECISION", () => {
    it("UNIDENTIFIED con importe por encima de materialidad", () => {
      expect(assignPriority({ amount: 1000 }, "UNIDENTIFIED", 0.8, materiality)).toBe("DECISION");
    });

    it("confidence por debajo de 0.70 con tipo normal", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_SIMPLE", 0.6, materiality)).toBe("DECISION");
    });

    it("confidence 0 con tipo no urgente", () => {
      expect(assignPriority({ amount: 100 }, "EXPENSE_NO_INVOICE", 0, materiality)).toBe(
        "DECISION"
      );
    });
  });

  // ── CONFIRMATION ──
  describe("CONFIRMATION", () => {
    it("confidence entre 0.70 y 0.89 con tipo normal", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_SIMPLE", 0.8, materiality)).toBe(
        "CONFIRMATION"
      );
    });

    it("MATCH_PARTIAL con confidence alta sigue siendo CONFIRMATION", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_PARTIAL", 0.95, materiality)).toBe(
        "CONFIRMATION"
      );
    });

    it("MATCH_DIFFERENCE con confidence alta sigue siendo CONFIRMATION", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_DIFFERENCE", 0.95, materiality)).toBe(
        "CONFIRMATION"
      );
    });
  });

  // ── ROUTINE ──
  describe("ROUTINE", () => {
    it("confidence >= 0.90 con MATCH_SIMPLE", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_SIMPLE", 0.9, materiality)).toBe("ROUTINE");
    });

    it("confidence >= 0.90 con EXPENSE_NO_INVOICE", () => {
      expect(assignPriority({ amount: -50 }, "EXPENSE_NO_INVOICE", 0.95, materiality)).toBe(
        "ROUTINE"
      );
    });
  });

  // ── Edge cases ──
  describe("Edge cases", () => {
    it("confidence exactamente 0.70 es CONFIRMATION (< es estricto)", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_SIMPLE", 0.7, materiality)).toBe(
        "CONFIRMATION"
      );
    });

    it("confidence exactamente 0.90 con MATCH_SIMPLE es ROUTINE", () => {
      expect(assignPriority({ amount: 100 }, "MATCH_SIMPLE", 0.9, materiality)).toBe("ROUTINE");
    });

    it("importes negativos usa valor absoluto", () => {
      expect(assignPriority({ amount: -1000 }, "UNIDENTIFIED", 0.8, materiality)).toBe("DECISION");
    });

    it("detectedType null con confidence alta es ROUTINE", () => {
      expect(assignPriority({ amount: 100 }, null, 0.95, materiality)).toBe("ROUTINE");
    });
  });
});
