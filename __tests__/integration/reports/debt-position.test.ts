/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  debtInstrument: { findMany: vi.fn() },
  debtTransaction: { findMany: vi.fn() },
  debtScheduleEntry: { findMany: vi.fn() },
  bankTransaction: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/db-scoped", () => ({ getScopedDb: () => mockPrisma }));

import { generateDebtPosition } from "@/lib/reports/debt-position";

describe("Debt Position Report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.debtInstrument.findMany.mockResolvedValue([]);
    mockPrisma.debtTransaction.findMany.mockResolvedValue([]);
    mockPrisma.bankTransaction.findFirst.mockResolvedValue(null);
    mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
  });

  it("returns empty summary when no instruments exist", async () => {
    const result = await generateDebtPosition(mockPrisma as any);
    expect(result.totalDebt).toBe(0);
    expect(result.netDebt).toBe(0);
    expect(result.instruments).toHaveLength(0);
    expect(result.overdueInstallments).toHaveLength(0);
    expect(result.covenants).toHaveLength(0);
  });

  it("calculates total debt from active instruments", async () => {
    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "d1",
        name: "ICO Loan",
        type: "TERM_LOAN",
        bankEntityName: "Santander",
        principalAmount: 100000,
        outstandingBalance: 80000,
        interestRateType: "FIXED",
        interestRateValue: 4.5,
        maturityDate: new Date("2028-12-31"),
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [],
      },
      {
        id: "d2",
        name: "Línea BBVA",
        type: "REVOLVING_CREDIT",
        bankEntityName: "BBVA",
        principalAmount: 0,
        outstandingBalance: 30000,
        interestRateType: "VARIABLE",
        interestRateValue: 3.0,
        maturityDate: new Date("2027-06-30"),
        status: "ACTIVE",
        creditLimit: 100000,
        currentDrawdown: 30000,
        covenants: [],
        schedule: [],
      },
    ]);
    mockPrisma.bankTransaction.findFirst.mockResolvedValue({ balanceAfter: 50000 });

    const result = await generateDebtPosition(mockPrisma as any);
    expect(result.totalDebt).toBe(110000);
    expect(result.cashBalance).toBe(50000);
    expect(result.netDebt).toBe(60000);
    expect(result.instruments).toHaveLength(2);
    expect(result.totalCreditLimit).toBe(100000);
    expect(result.totalDrawdown).toBe(30000);
    expect(result.availableCredit).toBe(70000);
  });

  it("calculates weighted average rate", async () => {
    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "d1",
        name: "A",
        type: "TERM_LOAN",
        bankEntityName: "X",
        principalAmount: 100000,
        outstandingBalance: 50000,
        interestRateType: "FIXED",
        interestRateValue: 4.0,
        maturityDate: new Date("2028-01-01"),
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [],
      },
      {
        id: "d2",
        name: "B",
        type: "TERM_LOAN",
        bankEntityName: "Y",
        principalAmount: 50000,
        outstandingBalance: 50000,
        interestRateType: "FIXED",
        interestRateValue: 6.0,
        maturityDate: new Date("2028-01-01"),
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [],
      },
    ]);

    const result = await generateDebtPosition(mockPrisma as any);
    // Weighted: (50000*4 + 50000*6) / 100000 = 5.0
    expect(result.weightedAvgRate).toBe(5);
  });

  it("detects overdue installments", async () => {
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 10);

    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "d1",
        name: "ICO",
        type: "TERM_LOAN",
        bankEntityName: "X",
        principalAmount: 100000,
        outstandingBalance: 80000,
        interestRateType: "FIXED",
        interestRateValue: 4.0,
        maturityDate: new Date("2028-01-01"),
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [{ entryNumber: 5, dueDate: pastDue, totalAmount: 2500, matched: false }],
      },
    ]);

    const result = await generateDebtPosition(mockPrisma as any);
    expect(result.overdueInstallments).toHaveLength(1);
    expect(result.overdueInstallments[0].daysOverdue).toBeGreaterThanOrEqual(10);
    expect(result.overdueInstallments[0].debtInstrumentName).toBe("ICO");
  });

  it("flags non-compliant covenants", async () => {
    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "d1",
        name: "Loan A",
        type: "TERM_LOAN",
        bankEntityName: "X",
        principalAmount: 100000,
        outstandingBalance: 80000,
        interestRateType: "FIXED",
        interestRateValue: 4.0,
        maturityDate: new Date("2028-01-01"),
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        schedule: [],
        covenants: [
          {
            id: "cov_1",
            name: "Debt/EBITDA",
            metric: "DEBT_TO_EBITDA",
            threshold: 3.0,
            operator: "LTE",
            lastTestedValue: 4.5,
            isCompliant: false,
          },
        ],
      },
    ]);

    const result = await generateDebtPosition(mockPrisma as any);
    expect(result.covenants).toHaveLength(1);
    expect(result.covenants[0].atRisk).toBe(true);
    expect(result.covenants[0].lastTestedValue).toBe(4.5);
  });

  it("separates short-term and long-term debt", async () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 2);
    const thisYear = new Date();
    thisYear.setMonth(thisYear.getMonth() + 6);

    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "d1",
        name: "Short",
        type: "TERM_LOAN",
        bankEntityName: "X",
        principalAmount: 50000,
        outstandingBalance: 30000,
        interestRateType: "FIXED",
        interestRateValue: 4.0,
        maturityDate: thisYear,
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [],
      },
      {
        id: "d2",
        name: "Long",
        type: "TERM_LOAN",
        bankEntityName: "Y",
        principalAmount: 200000,
        outstandingBalance: 150000,
        interestRateType: "FIXED",
        interestRateValue: 3.5,
        maturityDate: nextYear,
        status: "ACTIVE",
        creditLimit: null,
        currentDrawdown: null,
        covenants: [],
        schedule: [],
      },
    ]);

    const result = await generateDebtPosition(mockPrisma as any);
    expect(result.totalDebtShortTerm).toBe(30000);
    expect(result.totalDebtLongTerm).toBe(150000);
  });

  it("computes DSCR from debt transactions and operating cash", async () => {
    mockPrisma.debtInstrument.findMany.mockResolvedValue([]);
    mockPrisma.debtTransaction.findMany.mockResolvedValue([
      { type: "INSTALLMENT_PRINCIPAL", amount: 5000 },
      { type: "INSTALLMENT_INTEREST", amount: 1000 },
    ]);
    mockPrisma.bankTransaction.findMany.mockResolvedValue([{ amount: 30000 }, { amount: -12000 }]);

    const result = await generateDebtPosition(mockPrisma as any);
    // Annual service = 5000 + 1000 = 6000
    // Operating CF = 30000 - 12000 = 18000
    // DSCR = 18000 / 6000 = 3.0
    expect(result.dscr).toBe(3);
  });
});
