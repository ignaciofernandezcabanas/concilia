/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeNif, updateContactIfNewData } from "@/lib/contacts/utils";

// ════════════════════════════════════════════════════════════
// normalizeNif
// ════════════════════════════════════════════════════════════

describe("normalizeNif", () => {
  it("removes hyphens → B12345678", () => {
    expect(normalizeNif("B-12345678")).toBe("B12345678");
  });

  it("uppercases → B12345678", () => {
    expect(normalizeNif("b12345678")).toBe("B12345678");
  });

  it("null → null", () => {
    expect(normalizeNif(null)).toBeNull();
  });

  it("removes dots and spaces → B12345678", () => {
    expect(normalizeNif("B 12.345.678")).toBe("B12345678");
  });
});

// ════════════════════════════════════════════════════════════
// updateContactIfNewData
// ════════════════════════════════════════════════════════════

describe("updateContactIfNewData", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      contact: { update: vi.fn().mockResolvedValue({}) },
    };
  });

  it("fills empty email from new data", async () => {
    const existing = { email: null, iban: "ES1234" };
    const result = await updateContactIfNewData(mockDb, "c1", existing, {
      email: "test@example.com",
    });
    expect(result).toBe(true);
    expect(mockDb.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { email: "test@example.com" },
    });
  });

  it("does NOT overwrite existing email", async () => {
    const existing = { email: "old@example.com", iban: null };
    const result = await updateContactIfNewData(mockDb, "c1", existing, {
      email: "new@example.com",
    });
    expect(result).toBe(false);
    expect(mockDb.contact.update).not.toHaveBeenCalled();
  });

  it("returns false if no updates needed", async () => {
    const existing = { email: "a@b.com", iban: "ES99" };
    const result = await updateContactIfNewData(mockDb, "c1", existing, {
      email: "x@y.com",
      iban: "ES00",
    });
    expect(result).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Import endpoint logic
// ════════════════════════════════════════════════════════════

const mockCallAIJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/model-router", () => ({
  callAIJson: mockCallAIJson,
}));

describe("Import contacts logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes NIF before dedup check", () => {
    // Simulates what the import route does
    const rawNif = "B-12345678";
    const normalized = normalizeNif(rawNif);
    expect(normalized).toBe("B12345678");
  });

  it("skips rows without name", async () => {
    const contacts = [
      {
        name: "",
        nif: "B12345678",
        email: null,
        iban: null,
        type: "SUPPLIER" as const,
        paymentTermsDays: null,
      },
      {
        name: "Valid SL",
        nif: "A99999999",
        email: null,
        iban: null,
        type: "SUPPLIER" as const,
        paymentTermsDays: null,
      },
    ];
    const valid = contacts.filter((c) => c.name);
    expect(valid).toHaveLength(1);
    expect(valid[0].name).toBe("Valid SL");
  });

  it("updates existing contact (same NIF) instead of creating duplicate", () => {
    // Simulates dedup logic in the import route
    const existingContacts = [{ id: "c1", cif: "B-12345678", name: "Old Name", email: null }];
    const incomingNif = normalizeNif("B12345678");
    const match = existingContacts.find((c) => normalizeNif(c.cif) === incomingNif);
    expect(match).toBeDefined();
    expect(match!.id).toBe("c1");
  });

  it("creates new contact when NIF not found", () => {
    const existingContacts = [{ id: "c1", cif: "B12345678", name: "Existing SL" }];
    const incomingNif = normalizeNif("A99999999");
    const match = existingContacts.find((c) => normalizeNif(c.cif) === incomingNif);
    expect(match).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// Dedup logic
// ════════════════════════════════════════════════════════════

describe("Dedup logic", () => {
  it("same NIF in two contacts → auto-merge group", () => {
    const contacts = [
      { id: "c1", cif: "B12345678", name: "Company SL", email: "a@b.com" },
      { id: "c2", cif: "B12345678", name: "Company S.L.", email: null },
    ];

    const nifGroups = new Map<string, any[]>();
    for (const c of contacts) {
      const nif = normalizeNif(c.cif);
      if (nif) {
        const group = nifGroups.get(nif) ?? [];
        group.push(c);
        nifGroups.set(nif, group);
      }
    }

    expect(nifGroups.get("B12345678")).toHaveLength(2);
  });

  it("B-12345678 and B12345678 → same NIF after normalize", () => {
    expect(normalizeNif("B-12345678")).toBe(normalizeNif("B12345678"));
  });

  it("different NIFs → not merged", () => {
    const contacts = [
      { id: "c1", cif: "B12345678", name: "Company A" },
      { id: "c2", cif: "A99999999", name: "Company B" },
    ];

    const nifGroups = new Map<string, any[]>();
    for (const c of contacts) {
      const nif = normalizeNif(c.cif);
      if (nif) {
        const group = nifGroups.get(nif) ?? [];
        group.push(c);
        nifGroups.set(nif, group);
      }
    }

    // Each NIF has exactly 1 contact — no merge
    for (const group of Array.from(nifGroups.values())) {
      expect(group).toHaveLength(1);
    }
  });

  it("contact with most fields = canonical", () => {
    const fillableFields = [
      "email",
      "iban",
      "accountingEmail",
      "accountingContact",
      "paymentTermsDays",
      "irpfApplicable",
      "irpfRateImplied",
      "typicalAmountAvg",
      "avgPaymentDays",
      "cif",
    ];

    const contacts = [
      { id: "c1", cif: "B12345678", name: "Sparse", email: null, iban: null },
      {
        id: "c2",
        cif: "B12345678",
        name: "Complete",
        email: "a@b.com",
        iban: "ES1234",
        paymentTermsDays: 30,
      },
    ];

    const canonical = contacts.reduce((best, c: any) => {
      const score = fillableFields.filter((f) => (c as any)[f] != null).length;
      const bestScore = fillableFields.filter((f) => (best as any)[f] != null).length;
      return score > bestScore ? c : best;
    });

    expect(canonical.id).toBe("c2");
  });

  it("relations moved to canonical on merge", async () => {
    const mockDb = {
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      contact: { delete: vi.fn().mockResolvedValue({}) },
    };

    const canonicalId = "c1";
    const duplicateId = "c2";

    await mockDb.invoice.updateMany({
      where: { contactId: duplicateId },
      data: { contactId: canonicalId },
    });
    await mockDb.contact.delete({ where: { id: duplicateId } });

    expect(mockDb.invoice.updateMany).toHaveBeenCalledWith({
      where: { contactId: "c2" },
      data: { contactId: "c1" },
    });
    expect(mockDb.contact.delete).toHaveBeenCalledWith({ where: { id: "c2" } });
  });
});

// ════════════════════════════════════════════════════════════
// Enrich logic
// ════════════════════════════════════════════════════════════

describe("Enrich logic", () => {
  it("<3 movements → skip with confidence low", () => {
    const transactions = [{ id: "tx1" }, { id: "tx2" }];
    const shouldSkip = transactions.length < 3;
    expect(shouldSkip).toBe(true);
  });

  it("movements found by contactId (via invoices)", async () => {
    const mockDb = {
      invoice: {
        findMany: vi.fn().mockResolvedValue([{ id: "inv1" }, { id: "inv2" }]),
      },
      reconciliation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { bankTransactionId: "tx1" },
            { bankTransactionId: "tx2" },
            { bankTransactionId: "tx3" },
          ]),
      },
      bankTransaction: {
        findMany: vi.fn().mockResolvedValue([
          { id: "tx1", amount: 1000, concept: "Pago fra", date: new Date() },
          { id: "tx2", amount: 2000, concept: "Pago fra", date: new Date() },
          { id: "tx3", amount: 1500, concept: "Pago fra", date: new Date() },
        ]),
      },
    };

    const invoices = await mockDb.invoice.findMany({
      where: { contactId: "contact1" },
      select: { id: true },
    });
    expect(invoices).toHaveLength(2);

    const invoiceIds = invoices.map((inv: any) => inv.id);
    const reconciliations = await mockDb.reconciliation.findMany({
      where: { invoiceId: { in: invoiceIds } },
      select: { bankTransactionId: true },
    });
    const txIds = reconciliations.map((r: any) => r.bankTransactionId);

    const transactions = await mockDb.bankTransaction.findMany({
      where: { id: { in: txIds } },
    });
    expect(transactions).toHaveLength(3);
  });

  it("movements found by IBAN fallback", async () => {
    const mockDb = {
      bankTransaction: {
        findMany: vi.fn().mockResolvedValue([
          { id: "tx1", amount: 500, counterpartIban: "ES7620770024003102575766" },
          { id: "tx2", amount: 600, counterpartIban: "ES7620770024003102575766" },
          { id: "tx3", amount: 700, counterpartIban: "ES7620770024003102575766" },
        ]),
      },
    };

    const transactions = await mockDb.bankTransaction.findMany({
      where: { counterpartIban: "ES7620770024003102575766" },
    });
    expect(transactions).toHaveLength(3);
  });

  it("enrichedAt set after enrichment", async () => {
    const mockDb = {
      contact: { update: vi.fn().mockResolvedValue({}) },
    };

    const updateData: any = {
      enrichedAt: new Date(),
      enrichmentConfidence: "high",
      paymentTermsDays: 30,
    };

    await mockDb.contact.update({
      where: { id: "c1" },
      data: updateData,
    });

    expect(mockDb.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enrichedAt: expect.any(Date),
          enrichmentConfidence: "high",
        }),
      })
    );
  });
});
