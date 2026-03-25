/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  debtInstrument: { findMany: vi.fn() },
  debtScheduleEntry: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/db-scoped", () => ({ getScopedDb: () => mockPrisma }));

import { detectFinancing } from "@/lib/reconciliation/detectors/financing-detector";
import type { BankTransaction } from "@prisma/client";

function buildTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: "tx_1",
    externalId: null,
    valueDate: new Date("2026-03-15"),
    bookingDate: null,
    amount: -1500,
    currency: "EUR",
    concept: "PAGO PROVEEDOR",
    conceptParsed: null,
    counterpartIban: null,
    counterpartName: null,
    reference: null,
    balanceAfter: null,
    originalCurrency: "EUR",
    originalAmount: null,
    exchangeRate: null,
    status: "PENDING",
    priority: "ROUTINE",
    detectedType: null,
    classificationId: null,
    note: null,
    noteAuthorId: null,
    noteCreatedAt: null,
    reminderDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    syncedAt: null,
    companyId: "c1",
    duplicateGroupId: null,
    economicCategory: null,
    classificationNotes: null,
    ...overrides,
  } as BankTransaction;
}

describe("Financing Detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.debtInstrument.findMany.mockResolvedValue([]);
    mockPrisma.debtScheduleEntry.findMany.mockResolvedValue([]);
  });

  it("returns not-financing for normal transaction", async () => {
    const tx = buildTx({ concept: "COMPRA MATERIAL OFICINA" });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(false);
  });

  it("detects loan installment from concept CUOTA PRESTAMO", async () => {
    const tx = buildTx({ concept: "CUOTA PRESTAMO ICO", amount: -2500 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("LOAN_INSTALLMENT");
    expect(result.economicCategory).toBe("FINANCING_REPAYMENT");
  });

  it("detects interest settlement from concept LIQUIDACION INTERESES", async () => {
    const tx = buildTx({ concept: "LIQUIDACION INTERESES DEUDOR", amount: -350 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("INTEREST_SETTLEMENT");
    expect(result.economicCategory).toBe("FINANCING_INTEREST");
  });

  it("detects discount advance — confidence always 0", async () => {
    const tx = buildTx({ concept: "DESCUENTO EFECTO COMERCIAL", amount: 9500 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("DISCOUNT_ADVANCE");
    expect(result.confidence).toBe(0);
  });

  it("detects discount settlement", async () => {
    const tx = buildTx({ concept: "VENCIMIENTO DESCUENTO PAGARE", amount: -10000 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("DISCOUNT_SETTLEMENT");
  });

  it("detects leasing payment", async () => {
    const tx = buildTx({ concept: "LEASING VEHICULO FORD", amount: -800 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("LEASE_INSTALLMENT");
    expect(result.economicCategory).toBe("FINANCING_LEASE_PAYMENT");
  });

  it("detects debt commission", async () => {
    const tx = buildTx({ concept: "COMISION AVAL BANCARIO", amount: -250 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("DEBT_COMMISSION");
    expect(result.economicCategory).toBe("FINANCING_COMMISSION");
  });

  it("matches bank account to debt instrument — drawdown", async () => {
    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "debt_1",
        name: "Línea Santander",
        type: "REVOLVING_CREDIT",
        status: "ACTIVE",
        currentDrawdown: 50000,
        creditLimit: 100000,
        bankAccount: { iban: "ES1234567890123456789012" },
      },
    ]);

    const tx = buildTx({
      counterpartIban: "ES1234567890123456789012",
      amount: 20000,
      concept: "TRANSFERENCIA",
    });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("CREDIT_LINE_DRAWDOWN");
    expect(result.debtInstrumentId).toBe("debt_1");
    expect(result.confidence).toBe(0.9);
  });

  it("matches bank account to debt instrument — repayment", async () => {
    mockPrisma.debtInstrument.findMany.mockResolvedValue([
      {
        id: "debt_1",
        name: "Línea Santander",
        type: "REVOLVING_CREDIT",
        status: "ACTIVE",
        currentDrawdown: 50000,
        creditLimit: 100000,
        bankAccount: { iban: "ES1234567890123456789012" },
      },
    ]);

    const tx = buildTx({
      counterpartIban: "ES1234567890123456789012",
      amount: -20000,
      concept: "TRANSFERENCIA",
    });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("CREDIT_LINE_REPAYMENT");
  });

  it("matches schedule entry within ±5 days and exact amount", async () => {
    mockPrisma.debtScheduleEntry.findMany.mockResolvedValue([
      {
        id: "entry_1",
        debtInstrumentId: "debt_1",
        entryNumber: 3,
        dueDate: new Date("2026-03-17"),
        principalAmount: 1200,
        interestAmount: 300,
        totalAmount: 1500,
        outstandingAfter: 8800,
        matched: false,
        debtInstrument: { id: "debt_1", name: "ICO Loan" },
      },
    ]);

    const tx = buildTx({ amount: -1500, concept: "ADEUDO DIRECTO" });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("LOAN_INSTALLMENT");
    expect(result.confidence).toBe(0.95);
    expect(result.principalSplit).toBe(1200);
    expect(result.interestSplit).toBe(300);
    expect(result.scheduleEntryId).toBe("entry_1");
  });

  it("AMORTIZACION PRESTAMO in concept triggers loan installment", async () => {
    const tx = buildTx({ concept: "AMORTIZACION PRESTAMO BBVA", amount: -3000 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("LOAN_INSTALLMENT");
  });

  it("ARRENDAMIENTO FINANCIERO triggers lease installment", async () => {
    const tx = buildTx({ concept: "ARRENDAMIENTO FINANCIERO MAQUINARIA", amount: -1200 });
    const result = await detectFinancing(tx, mockPrisma as any);
    expect(result.isFinancing).toBe(true);
    expect(result.detectedType).toBe("LEASE_INSTALLMENT");
  });
});
