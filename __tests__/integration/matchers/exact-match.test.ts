import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBankTransaction, buildInvoice, buildContact } from "../../helpers/factories";

const mockPrisma = vi.hoisted(() => ({
  contact: { findMany: vi.fn() },
  invoice: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { findExactMatch } from "@/lib/reconciliation/matchers/exact-match";

describe("findExactMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("match por importe exacto e IBAN → confidence >= 0.95", async () => {
    const contact = buildContact();
    const invoice = buildInvoice({ totalAmount: 1000, type: "RECEIVED", contact });
    const tx = buildBankTransaction({ amount: -1000 });

    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

    const results = await findExactMatch(tx, mockPrisma as any);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.95);
    expect(results[0].matchReason).toContain("exact_amount");
    expect(results[0].matchReason).toContain("iban_match");
  });

  it("sin contacto con ese IBAN → array vacío", async () => {
    const tx = buildBankTransaction({ amount: -1000 });
    mockPrisma.contact.findMany.mockResolvedValue([]);

    const results = await findExactMatch(tx, mockPrisma as any);
    expect(results).toEqual([]);
  });

  it("sin IBAN ni CIF → array vacío, no busca facturas", async () => {
    const tx = buildBankTransaction({ counterpartIban: null, counterpartName: null });
    const results = await findExactMatch(tx, mockPrisma as any);
    expect(results).toEqual([]);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("tx positiva (cobro) → busca facturas ISSUED", async () => {
    const contact = buildContact();
    const tx = buildBankTransaction({ amount: 1000 }); // positive = income
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await findExactMatch(tx, mockPrisma as any);

    const invoiceCall = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(invoiceCall.where.type.in).toContain("ISSUED");
    expect(invoiceCall.where.type.in).not.toContain("RECEIVED");
  });

  it("tx negativa (pago) → busca facturas RECEIVED", async () => {
    const contact = buildContact();
    const tx = buildBankTransaction({ amount: -1000 }); // negative = expense
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await findExactMatch(tx, mockPrisma as any);

    const invoiceCall = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(invoiceCall.where.type.in).toContain("RECEIVED");
    expect(invoiceCall.where.type.in).not.toContain("ISSUED");
  });

  it("múltiples candidatos → ordenados por confidence descendente", async () => {
    const contact = buildContact();
    const inv1 = buildInvoice({
      id: "inv_1",
      issueDate: new Date("2026-03-01"),
      totalAmount: 1000,
      type: "RECEIVED",
      contact,
    });
    const inv2 = buildInvoice({
      id: "inv_2",
      issueDate: new Date("2026-03-14"),
      totalAmount: 1000,
      type: "RECEIVED",
      contact,
    });
    const tx = buildBankTransaction({ amount: -1000, valueDate: new Date("2026-03-15") });

    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([inv1, inv2]);

    const results = await findExactMatch(tx, mockPrisma as any);
    expect(results.length).toBe(2);
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
  });

  it("detecta CIF en counterpartName", async () => {
    const contact = buildContact({ cif: "B12345678" });
    const tx = buildBankTransaction({ counterpartIban: null, counterpartName: "B12345678" });
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await findExactMatch(tx, mockPrisma as any);
    const contactCall = mockPrisma.contact.findMany.mock.calls[0][0];
    expect(contactCall.where.OR).toEqual(
      expect.arrayContaining([expect.objectContaining({ cif: "B12345678" })])
    );
  });

  it("solo busca facturas en estado PENDING/PARTIAL/OVERDUE", async () => {
    const contact = buildContact();
    const tx = buildBankTransaction({ amount: -1000 });
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await findExactMatch(tx, mockPrisma as any);
    const invoiceCall = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(invoiceCall.where.status.in).toEqual(["PENDING", "PARTIAL", "OVERDUE"]);
  });

  it("normaliza IBAN con espacios y mayúsculas", async () => {
    const contact = buildContact({ iban: "ES76 2077 0024 0031 0257 5766" });
    const tx = buildBankTransaction({ counterpartIban: "es76 2077 0024 0031 0257 5766" });
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await findExactMatch(tx, mockPrisma as any);
    const contactCall = mockPrisma.contact.findMany.mock.calls[0][0];
    expect(contactCall.where.OR[0].iban).toBe("ES7620770024003102575766");
  });
});
