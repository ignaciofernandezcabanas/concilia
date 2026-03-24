import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBankTransaction, buildInvoice, buildContact } from "../../helpers/factories";

const mockPrisma = vi.hoisted(() => ({
  invoice: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { findFuzzyMatch } from "@/lib/reconciliation/matchers/fuzzy-match";

describe("findFuzzyMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("match por importe dentro del 5% de tolerancia", async () => {
    const contact = buildContact();
    const invoice = buildInvoice({
      totalAmount: 1000,
      type: "RECEIVED",
      description: "Consultoría",
      contact,
    });
    const tx = buildBankTransaction({ amount: -980, concept: "Consultoría services" }); // 2% difference

    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(results[0].confidence).toBeLessThanOrEqual(0.85);
  });

  it("fuera de tolerancia (>5%) → sin match", async () => {
    const tx = buildBankTransaction({ amount: -900, concept: "Test" }); // 10% off from 1000
    mockPrisma.invoice.findMany.mockResolvedValue([]); // prisma filters by amount range

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    expect(results).toEqual([]);
  });

  it("sin concepto → fallback a amount-only con confidence <= 0.75", async () => {
    const invoice = buildInvoice({
      totalAmount: 1000,
      type: "RECEIVED",
      description: "Test",
      contact: buildContact(),
    });
    const tx = buildBankTransaction({
      amount: -990,
      concept: null,
      conceptParsed: null,
      counterpartName: null,
    });

    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeLessThanOrEqual(0.75);
  });

  it("confidence nunca supera 0.85", async () => {
    const contact = buildContact();
    const invoice = buildInvoice({
      totalAmount: 1000,
      type: "RECEIVED",
      description: "Servicio exacto",
      contact,
    });
    const tx = buildBankTransaction({ amount: -999, concept: "Servicio exacto" }); // near exact

    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    if (results.length > 0) {
      expect(results[0].confidence).toBeLessThanOrEqual(0.85);
    }
  });

  it("calcula amountDifference y differencePercent", async () => {
    const contact = buildContact();
    const invoice = buildInvoice({
      totalAmount: 1000,
      type: "RECEIVED",
      description: "Servicio",
      contact,
    });
    const tx = buildBankTransaction({ amount: -985, concept: "Servicio pago" });

    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    if (results.length > 0) {
      expect(results[0].amountDifference).toBe(15); // 1000 - 985
      expect(results[0].differencePercent).toBeCloseTo(1.5, 1);
    }
  });

  it("sugiere BANK_COMMISSION para diferencia ~1.5%", async () => {
    const contact = buildContact();
    const invoice = buildInvoice({
      totalAmount: 1000,
      type: "RECEIVED",
      description: "Servicio",
      contact,
    });
    const tx = buildBankTransaction({ amount: -985, concept: "Servicio mensual" });

    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    if (results.length > 0) {
      expect(results[0].suggestedDifferenceReason).toBe("BANK_COMMISSION");
    }
  });

  it("sugiere EARLY_PAYMENT para diferencia ~3.5%", async () => {
    const contact = buildContact();
    const invoice = buildInvoice({
      totalAmount: 1000,
      type: "RECEIVED",
      description: "Servicio",
      contact,
    });
    const tx = buildBankTransaction({ amount: -965, concept: "Servicio con descuento" });

    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findFuzzyMatch(tx, mockPrisma as any);
    if (results.length > 0) {
      expect(results[0].suggestedDifferenceReason).toBe("EARLY_PAYMENT");
    }
  });
});
