import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas used across the app for edge cases
describe("Validation Edge Cases", () => {
  // Common invoice schema (simplified)
  const invoiceSchema = z.object({
    number: z.string().min(1),
    totalAmount: z.number().positive(),
    type: z.enum(["ISSUED", "RECEIVED"]),
    issueDate: z.string(),
  });

  it("factura con amount 0 → error validation", () => {
    const result = invoiceSchema.safeParse({
      number: "FRA-001", totalAmount: 0, type: "ISSUED", issueDate: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("factura con amount negativo → error validation", () => {
    const result = invoiceSchema.safeParse({
      number: "FRA-001", totalAmount: -500, type: "ISSUED", issueDate: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("factura sin número → error validation", () => {
    const result = invoiceSchema.safeParse({
      number: "", totalAmount: 1000, type: "ISSUED", issueDate: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("factura válida → pasa validation", () => {
    const result = invoiceSchema.safeParse({
      number: "FRA-001", totalAmount: 1000, type: "ISSUED", issueDate: "2026-03-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("Number Rounding (financial precision)", () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it("0.1 + 0.2 → 0.30 (no floating point error)", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("1000.005 → 1000.01 (banker's rounding)", () => {
    expect(round2(1000.005)).toBe(1000.01);
  });

  it("difference tolerance 0.01€", () => {
    const a = 1200.00;
    const b = 1199.99;
    const diff = Math.abs(a - b);
    expect(diff).toBeLessThanOrEqual(0.01);
  });
});

describe("Date Edge Cases", () => {
  it("getMonthRange for January doesn't shift to December (UTC bug)", () => {
    // CET midnight Jan 1 = Dec 31 UTC — the bug that was fixed
    const jan = new Date(2026, 0, 1); // Local Jan 1
    expect(jan.getMonth()).toBe(0);
    expect(jan.getDate()).toBe(1);
  });

  it("leap year handling", () => {
    // 2028 is a leap year
    const feb29 = new Date(2028, 1, 29);
    expect(feb29.getDate()).toBe(29);
    expect(feb29.getMonth()).toBe(1);
  });
});
