/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  account: { findFirst: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
  supportingDocument: { create: vi.fn(), update: vi.fn() },
  notification: { create: vi.fn() },
};

import { registerSupportingDocument, getDefaults } from "@/lib/accounting/supporting-docs";

describe("Supporting Documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.account.findFirst.mockImplementation(async ({ where }: any) => ({
      id: `acct_${where.code}`,
    }));
    mockDb.journalEntry.findFirst.mockResolvedValue({ number: 100 });
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_1" });
    mockDb.supportingDocument.create.mockResolvedValue({ id: "doc_1" });
    mockDb.supportingDocument.update.mockResolvedValue({});
  });

  it("registers ACTA_JUNTA with correct accounts (129/112)", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "ACTA_JUNTA",
      description: "Acta junta general",
      date: new Date("2026-01-15"),
      amount: 50000,
    });

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].accountId).toBe("acct_129");
    expect(createCall.data.lines.create[1].accountId).toBe("acct_112");
  });

  it("registers CONTRATO_PRESTAMO with accounts 572/170", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "CONTRATO_PRESTAMO",
      description: "Préstamo bancario",
      date: new Date("2026-02-01"),
      amount: 100000,
    });

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].accountId).toBe("acct_572");
    expect(createCall.data.lines.create[1].accountId).toBe("acct_170");
  });

  it("registers MODELO_FISCAL with accounts 4750/572", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "MODELO_FISCAL",
      description: "Modelo 303 T1",
      date: new Date("2026-04-20"),
      amount: 5000,
    });

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].accountId).toBe("acct_4750");
    expect(createCall.data.lines.create[1].accountId).toBe("acct_572");
  });

  it("registers RECIBO_NOMINA with accounts 640/572", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "RECIBO_NOMINA",
      description: "Nómina enero",
      date: new Date("2026-01-31"),
      amount: 3500,
    });

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].accountId).toBe("acct_640");
    expect(createCall.data.lines.create[1].accountId).toBe("acct_572");
  });

  it("getDefaults returns correct defaults for each type", () => {
    expect(getDefaults("ACTA_JUNTA")).toEqual({
      debit: "129",
      credit: "112",
      cashflow: "FINANCING",
      direction: "NONE",
    });
    expect(getDefaults("CONTRATO_PRESTAMO")).toEqual({
      debit: "572",
      credit: "170",
      cashflow: "FINANCING",
      direction: "INFLOW",
    });
    expect(getDefaults("MODELO_FISCAL")).toEqual({
      debit: "4750",
      credit: "572",
      cashflow: "OPERATING",
      direction: "OUTFLOW",
    });
    expect(getDefaults("RECIBO_NOMINA")).toEqual({
      debit: "640",
      credit: "572",
      cashflow: "OPERATING",
      direction: "OUTFLOW",
    });
    // Unknown type falls back to OTRO
    expect(getDefaults("UNKNOWN_TYPE")).toEqual({
      debit: "629",
      credit: "572",
      cashflow: "OPERATING",
      direction: "OUTFLOW",
    });
  });

  it("JE lines balance (debit = credit)", async () => {
    const amount = 25000;
    await registerSupportingDocument(mockDb as any, {
      type: "POLIZA_SEGURO",
      description: "Póliza RC anual",
      date: new Date("2026-03-01"),
      amount,
    });

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    const lines = createCall.data.lines.create;
    const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(amount);
  });

  it("status is PENDING_APPROVAL after register", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "ESCRITURA",
      description: "Ampliación capital",
      date: new Date("2026-06-01"),
      amount: 60000,
    });

    const docCreate = mockDb.supportingDocument.create.mock.calls[0][0];
    expect(docCreate.data.status).toBe("PENDING_APPROVAL");
  });

  it("custom accounts override defaults", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "ACTA_JUNTA",
      description: "Custom accounts",
      date: new Date("2026-01-15"),
      amount: 10000,
      debitAccountCode: "550",
      creditAccountCode: "113",
    });

    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].accountId).toBe("acct_550");
    expect(createCall.data.lines.create[1].accountId).toBe("acct_113");
  });

  it("amount passed correctly to both doc and JE", async () => {
    const amount = 42000;
    await registerSupportingDocument(mockDb as any, {
      type: "CONTRATO_ALQUILER",
      description: "Alquiler oficina",
      date: new Date("2026-05-01"),
      amount,
    });

    const docCreate = mockDb.supportingDocument.create.mock.calls[0][0];
    expect(docCreate.data.amount).toBe(amount);

    const jeCreate = mockDb.journalEntry.create.mock.calls[0][0];
    expect(jeCreate.data.lines.create[0].debit).toBe(amount);
    expect(jeCreate.data.lines.create[1].credit).toBe(amount);
  });

  it("doc linked to JE via journalEntryId", async () => {
    await registerSupportingDocument(mockDb as any, {
      type: "LIQUIDACION_INTERESES",
      description: "Intereses préstamo",
      date: new Date("2026-03-31"),
      amount: 1500,
    });

    const updateCall = mockDb.supportingDocument.update.mock.calls[0][0];
    expect(updateCall.data.journalEntryId).toBe("je_1");
    expect(updateCall.where.id).toBe("doc_1");
  });
});
