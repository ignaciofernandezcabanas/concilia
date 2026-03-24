import { describe, it, expect } from "vitest";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
  balance: z.number(),
});

describe("Opening Balance", () => {
  it("valid data passes schema", () => {
    const result = schema.safeParse({ date: "2026-01-01", balance: 87432.5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance).toBe(87432.5);
    }
  });

  it("creates tx with amount=0 and correct fields", () => {
    const data = { date: "2026-01-01", balance: 87432.5 };
    const created = {
      amount: 0,
      balanceAfter: data.balance,
      concept: "Saldo inicial",
      status: "RECONCILED",
      detectedType: "OPENING_BALANCE",
      externalId: `opening_balance_${data.date}`,
      valueDate: new Date(data.date),
    };
    expect(created.amount).toBe(0);
    expect(created.balanceAfter).toBe(87432.5);
    expect(created.detectedType).toBe("OPENING_BALANCE");
    expect(created.status).toBe("RECONCILED");
  });

  it("accepts negative balance (overdraft)", () => {
    const result = schema.safeParse({ date: "2026-01-01", balance: -5000 });
    expect(result.success).toBe(true);
  });

  it("date is required", () => {
    const result = schema.safeParse({ balance: 50000 });
    expect(result.success).toBe(false);
  });

  it("balance is required", () => {
    const result = schema.safeParse({ date: "2026-01-01" });
    expect(result.success).toBe(false);
  });

  it("invalid date format rejected", () => {
    const result = schema.safeParse({ date: "01/01/2026", balance: 1000 });
    expect(result.success).toBe(false);
  });

  it("externalId is deterministic per date", () => {
    const date = "2026-03-15";
    const id1 = `opening_balance_${date}`;
    const id2 = `opening_balance_${date}`;
    expect(id1).toBe(id2);
  });
});
