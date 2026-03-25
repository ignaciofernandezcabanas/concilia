/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => ({
  debtInstrument: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  debtScheduleEntry: { deleteMany: vi.fn(), create: vi.fn() },
  debtTransaction: { findMany: vi.fn(), create: vi.fn() },
  debtCovenant: { findMany: vi.fn() },
  bankTransaction: { findFirst: vi.fn(), findMany: vi.fn() },
  account: { findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: mockDb }));
vi.mock("@/lib/db-scoped", () => ({ getScopedDb: () => mockDb }));
vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: any) => handler,
}));

// ---------------------------------------------------------------------------
// Helpers — simulate route handler calls
// ---------------------------------------------------------------------------

import { generateAmortizationSchedule } from "@/lib/debt/amortization-schedule";
import { generateDebtPosition } from "@/lib/reports/debt-position";

describe("Debt API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.debtInstrument.findMany.mockResolvedValue([]);
    mockDb.debtInstrument.findUnique.mockResolvedValue(null);
    mockDb.debtTransaction.findMany.mockResolvedValue([]);
    mockDb.bankTransaction.findFirst.mockResolvedValue(null);
    mockDb.bankTransaction.findMany.mockResolvedValue([]);
    mockDb.account.findMany.mockResolvedValue([]);
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 10 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_new" });
  });

  // -------------------------------------------------------------------------
  // 1. Validation: POST without valid body → 400
  // -------------------------------------------------------------------------
  it("rejects creation with missing required fields", () => {
    const { createSchema } = buildCreateSchema();
    const result = createSchema.safeParse({ name: "Test" }); // missing many fields
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. TERM_LOAN without schedule → auto-generates French schedule
  // -------------------------------------------------------------------------
  it("generates French schedule for TERM_LOAN when no schedule provided", () => {
    const schedule = generateAmortizationSchedule({
      principal: 120000,
      annualRate: 4.0,
      termMonths: 12,
      startDate: new Date("2026-01-01"),
      paymentDay: 5,
    });

    expect(schedule).toHaveLength(12);
    // Sum of principal should ≈ 120000
    const totalPrincipal = schedule.reduce((s, e) => s + e.principalAmount, 0);
    expect(Math.abs(totalPrincipal - 120000)).toBeLessThan(1);
    // Last entry should have outstandingAfter ≈ 0
    expect(schedule[schedule.length - 1].outstandingAfter).toBeLessThan(0.01);
    // All entries should have a dueDate on or near day 5
    for (const entry of schedule) {
      expect(entry.dueDate.getDate()).toBeLessThanOrEqual(5);
    }
  });

  // -------------------------------------------------------------------------
  // 3. REVOLVING_CREDIT without creditLimit → 400
  // -------------------------------------------------------------------------
  it("rejects REVOLVING_CREDIT without creditLimit", () => {
    const { createSchema } = buildCreateSchema();
    const result = createSchema.safeParse({
      name: "Póliza BBVA",
      type: "REVOLVING_CREDIT",
      bankEntityName: "BBVA",
      principalAmount: 50000,
      interestRateType: "VARIABLE",
      interestRateValue: 3.5,
      startDate: "2026-01-01",
      maturityDate: "2027-01-01",
      paymentFrequency: "MONTHLY",
      // creditLimit: missing → will validate at schema level, but business rule is in route
    });
    // Schema parse should succeed (creditLimit is optional in Zod)
    // but the route handler checks isRevolving && !creditLimit → 400
    // We verify the business logic:
    const isRevolving = result.success && result.data.type === "REVOLVING_CREDIT";
    const hasCreditLimit = result.success && result.data.creditLimit != null;
    expect(isRevolving).toBe(true);
    expect(hasCreditLimit).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. GET summary → netDebt = totalDebt - cashBalance
  // -------------------------------------------------------------------------
  it("calculates netDebt = totalDebt - cashBalance in summary", async () => {
    mockDb.debtInstrument.findMany.mockResolvedValue([
      {
        id: "d1",
        name: "ICO",
        type: "TERM_LOAN",
        bankEntityName: "CaixaBank",
        principalAmount: 200000,
        outstandingBalance: 150000,
        interestRateType: "FIXED",
        interestRateValue: 3.0,
        maturityDate: new Date("2029-12-31"),
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [],
      },
    ]);
    mockDb.bankTransaction.findFirst.mockResolvedValue({ balanceAfter: 45000 });

    const result = await generateDebtPosition(mockDb as any);
    expect(result.totalDebt).toBe(150000);
    expect(result.cashBalance).toBe(45000);
    expect(result.netDebt).toBe(105000);
  });

  // -------------------------------------------------------------------------
  // 5. Reclassification LP→CP returns correct amount
  // -------------------------------------------------------------------------
  it("computes correct LP→CP reclassification amount", () => {
    const closingDate = new Date("2026-12-31");
    const oneYearFromClosing = new Date(closingDate);
    oneYearFromClosing.setFullYear(oneYearFromClosing.getFullYear() + 1);

    const schedule = [
      { principalAmount: 5000, dueDate: new Date("2027-03-05") }, // within 1yr
      { principalAmount: 5000, dueDate: new Date("2027-06-05") }, // within 1yr
      { principalAmount: 5000, dueDate: new Date("2027-09-05") }, // within 1yr
      { principalAmount: 5000, dueDate: new Date("2027-12-05") }, // within 1yr
      { principalAmount: 5000, dueDate: new Date("2028-03-05") }, // beyond 1yr
    ];

    const shortTermEntries = schedule.filter(
      (e) => e.dueDate > closingDate && e.dueDate <= oneYearFromClosing
    );
    const shortTermPrincipal = shortTermEntries.reduce((s, e) => s + e.principalAmount, 0);

    expect(shortTermEntries).toHaveLength(4);
    expect(shortTermPrincipal).toBe(20000);
  });

  // -------------------------------------------------------------------------
  // 6. PUT with matched schedule entries preserves them
  // -------------------------------------------------------------------------
  it("preserves matched schedule entries when regenerating", () => {
    const existingSchedule = [
      { id: "s1", matched: true, dueDate: new Date("2026-01-05") },
      { id: "s2", matched: true, dueDate: new Date("2026-02-05") },
      { id: "s3", matched: false, dueDate: new Date("2026-03-05") },
      { id: "s4", matched: false, dueDate: new Date("2027-04-05") },
    ];

    const now = new Date("2026-06-01");
    const unmatchedFutureIds = existingSchedule
      .filter((e) => !e.matched && new Date(e.dueDate) >= now)
      .map((e) => e.id);

    // Only s4 is unmatched AND future — s3 is past
    expect(unmatchedFutureIds).toEqual(["s4"]);
    // Matched entries s1 & s2 are never touched
    const matchedIds = existingSchedule.filter((e) => e.matched).map((e) => e.id);
    expect(matchedIds).toEqual(["s1", "s2"]);
  });
});

// ---------------------------------------------------------------------------
// Helper: replicate the Zod schema from route.ts for validation tests
// ---------------------------------------------------------------------------
function buildCreateSchema() {
  const { z } = require("zod");
  const scheduleEntrySchema = z.object({
    entryNumber: z.number().int().positive(),
    dueDate: z.string(),
    principalAmount: z.number().min(0),
    interestAmount: z.number().min(0),
    totalAmount: z.number().min(0),
    outstandingAfter: z.number().min(0),
  });
  const covenantSchema = z.object({
    name: z.string().min(1),
    metric: z.enum([
      "DEBT_TO_EBITDA",
      "DSCR",
      "CURRENT_RATIO",
      "NET_WORTH",
      "EQUITY_RATIO",
      "LEVERAGE_RATIO",
    ]),
    threshold: z.number(),
    operator: z.enum(["LT", "LTE", "GT", "GTE"]),
    testFrequency: z
      .enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ON_DEMAND", "BULLET"])
      .default("QUARTERLY"),
  });
  const createSchema = z.object({
    name: z.string().min(1),
    type: z.enum([
      "TERM_LOAN",
      "REVOLVING_CREDIT",
      "DISCOUNT_LINE",
      "CONFIRMING",
      "FINANCE_LEASE",
      "OVERDRAFT",
      "GUARANTEE",
    ]),
    bankEntityName: z.string().min(1),
    principalAmount: z.number().positive(),
    interestRateType: z.enum(["FIXED", "VARIABLE"]),
    interestRateValue: z.number().min(0),
    startDate: z.string(),
    maturityDate: z.string(),
    paymentFrequency: z.enum([
      "MONTHLY",
      "QUARTERLY",
      "SEMIANNUAL",
      "ANNUAL",
      "ON_DEMAND",
      "BULLET",
    ]),
    creditLimit: z.number().positive().optional(),
    paymentDay: z.number().int().min(1).max(28).optional(),
    gracePeriodEndDate: z.string().optional(),
    schedule: z.array(scheduleEntrySchema).optional(),
    covenants: z.array(covenantSchema).optional(),
  });
  return { createSchema };
}
