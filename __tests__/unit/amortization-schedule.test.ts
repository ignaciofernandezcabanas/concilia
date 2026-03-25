import { describe, it, expect } from "vitest";
import { generateAmortizationSchedule, type ScheduleInput } from "@/lib/debt/amortization-schedule";
import { validateImportedSchedule, type ImportedScheduleRow } from "@/lib/debt/schedule-import";

// ---------------------------------------------------------------------------
// Amortization schedule generator
// ---------------------------------------------------------------------------

describe("generateAmortizationSchedule", () => {
  const baseInput: ScheduleInput = {
    principal: 120000,
    annualRate: 6.0,
    termMonths: 12,
    startDate: new Date("2026-01-01"),
    paymentDay: 5,
  };

  it("generates correct number of entries", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    expect(schedule).toHaveLength(12);
  });

  it("last entry outstanding is 0", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    const last = schedule[schedule.length - 1];
    expect(last.outstandingAfter).toBe(0);
  });

  it("sum of principal equals input principal", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    const totalPrincipal = schedule.reduce((s, e) => s + e.principalAmount, 0);
    expect(Math.abs(totalPrincipal - baseInput.principal)).toBeLessThan(0.02);
  });

  it("each entry total = principal + interest", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    for (const entry of schedule) {
      const expected = Math.round((entry.principalAmount + entry.interestAmount) * 100) / 100;
      expect(Math.abs(entry.totalAmount - expected)).toBeLessThanOrEqual(0.01);
    }
  });

  it("constant payment (French system) — all payments are equal except last", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    const payments = schedule.slice(0, -1).map((e) => e.totalAmount);
    const first = payments[0];
    for (const p of payments) {
      expect(Math.abs(p - first)).toBeLessThanOrEqual(0.01);
    }
  });

  it("interest decreases over time", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].interestAmount).toBeLessThanOrEqual(schedule[i - 1].interestAmount + 0.01);
    }
  });

  it("principal increases over time (excluding grace)", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    for (let i = 1; i < schedule.length - 1; i++) {
      expect(schedule[i].principalAmount).toBeGreaterThanOrEqual(
        schedule[i - 1].principalAmount - 0.01
      );
    }
  });

  it("due dates use specified payment day", () => {
    const schedule = generateAmortizationSchedule(baseInput);
    for (const entry of schedule) {
      expect(entry.dueDate.getDate()).toBe(5);
    }
  });

  it("handles grace period — first N months are interest-only", () => {
    const input: ScheduleInput = {
      ...baseInput,
      termMonths: 15,
      graceMonths: 3,
    };
    const schedule = generateAmortizationSchedule(input);
    expect(schedule).toHaveLength(15);

    // Grace period entries
    for (let i = 0; i < 3; i++) {
      expect(schedule[i].principalAmount).toBe(0);
      expect(schedule[i].interestAmount).toBeGreaterThan(0);
      expect(schedule[i].outstandingAfter).toBe(input.principal);
    }

    // Post-grace entries should have principal
    for (let i = 3; i < schedule.length; i++) {
      expect(schedule[i].principalAmount).toBeGreaterThan(0);
    }

    // Sum of principal in amortizing period = principal
    const totalPrincipal = schedule.slice(3).reduce((s, e) => s + e.principalAmount, 0);
    expect(Math.abs(totalPrincipal - input.principal)).toBeLessThan(0.02);
  });

  it("handles 0% interest rate", () => {
    const input: ScheduleInput = {
      ...baseInput,
      annualRate: 0,
    };
    const schedule = generateAmortizationSchedule(input);
    expect(schedule).toHaveLength(12);

    for (const entry of schedule) {
      expect(entry.interestAmount).toBe(0);
    }

    const totalPrincipal = schedule.reduce((s, e) => s + e.principalAmount, 0);
    expect(Math.abs(totalPrincipal - input.principal)).toBeLessThan(0.02);
    expect(schedule[schedule.length - 1].outstandingAfter).toBe(0);
  });

  it("handles payment day 28 in February", () => {
    const input: ScheduleInput = {
      principal: 10000,
      annualRate: 5.0,
      termMonths: 3,
      startDate: new Date("2026-01-01"),
      paymentDay: 31,
    };
    const schedule = generateAmortizationSchedule(input);
    // February entry should clamp to last day
    const febEntry = schedule.find((e) => e.dueDate.getMonth() === 1); // 0-indexed
    expect(febEntry).toBeDefined();
    expect(febEntry!.dueDate.getDate()).toBeLessThanOrEqual(28);
  });

  it("large loan — 300 months mortgage", () => {
    const input: ScheduleInput = {
      principal: 200000,
      annualRate: 3.5,
      termMonths: 300,
      startDate: new Date("2026-01-01"),
      paymentDay: 1,
    };
    const schedule = generateAmortizationSchedule(input);
    expect(schedule).toHaveLength(300);
    expect(schedule[schedule.length - 1].outstandingAfter).toBe(0);

    const totalPrincipal = schedule.reduce((s, e) => s + e.principalAmount, 0);
    expect(Math.abs(totalPrincipal - input.principal)).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// Schedule import validation
// ---------------------------------------------------------------------------

describe("validateImportedSchedule", () => {
  function makeRows(count: number, principal: number): ImportedScheduleRow[] {
    const perEntry = Math.round((principal / count) * 100) / 100;
    let outstanding = principal;
    return Array.from({ length: count }, (_, i) => {
      const isLast = i === count - 1;
      const p = isLast ? Math.round(outstanding * 100) / 100 : perEntry;
      outstanding -= p;
      if (outstanding < 0) outstanding = 0;
      return {
        entryNumber: i + 1,
        dueDate: new Date(2026, i + 1, 5).toISOString().slice(0, 10),
        principalAmount: p,
        interestAmount: 50,
        totalAmount: Math.round((p + 50) * 100) / 100,
        outstandingAfter: Math.round(outstanding * 100) / 100,
      };
    });
  }

  it("valid schedule passes", () => {
    const rows = makeRows(12, 12000);
    const result = validateImportedSchedule(rows, 12000);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("empty schedule fails", () => {
    const result = validateImportedSchedule([], 10000);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("empty");
  });

  it("principal sum mismatch fails", () => {
    const rows = makeRows(12, 12000);
    const result = validateImportedSchedule(rows, 50000);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("principal");
  });

  it("non-chronological dates fail", () => {
    const rows = makeRows(3, 3000);
    rows[1].dueDate = rows[0].dueDate; // same date
    const result = validateImportedSchedule(rows, 3000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not after"))).toBe(true);
  });

  it("total != principal + interest fails", () => {
    const rows = makeRows(3, 3000);
    rows[0].totalAmount = 9999;
    const result = validateImportedSchedule(rows, 3000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("totalAmount"))).toBe(true);
  });

  it("negative outstanding fails", () => {
    const rows = makeRows(3, 3000);
    rows[1].outstandingAfter = -100;
    const result = validateImportedSchedule(rows, 3000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("negative"))).toBe(true);
  });

  it("minor rounding difference is a warning, not error", () => {
    const rows = makeRows(3, 3000);
    // Adjust to have small rounding difference
    rows[rows.length - 1].principalAmount += 0.05;
    rows[rows.length - 1].totalAmount += 0.05;
    const result = validateImportedSchedule(rows, 3000);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("last entry with outstanding > 1 is a warning", () => {
    const rows = makeRows(3, 3000);
    rows[rows.length - 1].outstandingAfter = 5;
    const result = validateImportedSchedule(rows, 3000);
    // Still valid (it's a warning, not error)
    expect(result.warnings.some((w) => w.includes("outstanding"))).toBe(true);
  });
});
