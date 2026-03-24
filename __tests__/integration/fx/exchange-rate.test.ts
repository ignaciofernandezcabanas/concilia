import { describe, it, expect } from "vitest";
import { convertToEUR, calculateFXDifference, SUPPORTED_CURRENCIES } from "@/lib/fx/exchange-rate";

describe("exchange-rate", () => {
  describe("convertToEUR", () => {
    it("EUR-to-EUR conversion returns rate 1.0", async () => {
      const result = await convertToEUR(100, "EUR", new Date("2026-03-15"));
      expect(result.eurAmount).toBe(100);
      expect(result.rate).toBe(1);
    });
  });

  describe("calculateFXDifference", () => {
    it("favorable settlement rate → GAIN, account 768", () => {
      // Booked at 1.10 (1 EUR = 1.10 USD), settled at 1.20 (EUR stronger)
      // 1000 USD at book rate = 909.09 EUR; at settlement rate = 833.33 EUR
      // Wait — if EUR is stronger at settlement, we get fewer EUR → that's a LOSS for receivables
      // But the function computes settlement - book: 833.33 - 909.09 = -75.76 → LOSS
      // For a GAIN: settlement rate should be lower (EUR weaker at settlement)
      // Booked at 1.20, settled at 1.10 → book = 833.33, settlement = 909.09, diff = +75.76
      const result = calculateFXDifference(1000, 1.2, 1.1);
      expect(result.differenceEur).toBeGreaterThan(0);
      expect(result.type).toBe("GAIN");
      expect(result.pgcAccount).toBe("768");
    });

    it("unfavorable settlement rate → LOSS, account 668", () => {
      // Booked at 1.10, settled at 1.20 → book = 909.09, settlement = 833.33, diff = -75.76
      const result = calculateFXDifference(1000, 1.1, 1.2);
      expect(result.differenceEur).toBeLessThan(0);
      expect(result.type).toBe("LOSS");
      expect(result.pgcAccount).toBe("668");
    });

    it("equal rates → difference 0, type GAIN", () => {
      const result = calculateFXDifference(500, 1.08, 1.08);
      expect(result.differenceEur).toBe(0);
      expect(result.type).toBe("GAIN");
    });
  });

  describe("SUPPORTED_CURRENCIES", () => {
    it("has 31 entries (EUR + 30 foreign)", () => {
      expect(SUPPORTED_CURRENCIES).toHaveLength(31);
      expect(SUPPORTED_CURRENCIES[0].code).toBe("EUR");
      // Verify all codes are unique
      const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
      expect(new Set(codes).size).toBe(31);
    });
  });
});
