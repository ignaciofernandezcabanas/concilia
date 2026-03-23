import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  fixedAsset: { findMany: vi.fn(), update: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { runMonthlyDepreciation } from "@/lib/accounting/depreciation";

function buildAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset_1",
    name: "Equipo informático",
    status: "ACTIVE",
    acquisitionCost: 12000,
    residualValue: 0,
    usefulLifeMonths: 48,
    monthlyDepreciation: 250,
    accumulatedDepreciation: 0,
    netBookValue: 12000,
    lastDepreciationDate: null,
    depreciationAccount: { id: "acc_681", code: "681" },
    accumDepAccount: { id: "acc_281", code: "281" },
    ...overrides,
  };
}

describe("Monthly Depreciation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.fixedAsset.findMany.mockResolvedValue([]);
    mockDb.fixedAsset.update.mockResolvedValue({});
    mockDb.journalEntry.findFirst.mockResolvedValue(null);
    mockDb.journalEntry.create.mockResolvedValue({ id: "je_1" });
  });

  it("sin activos → 0 procesados, 0 asientos", async () => {
    const result = await runMonthlyDepreciation(mockDb as any, 2026, 3);
    expect(result.assetsProcessed).toBe(0);
    expect(result.entriesCreated).toBe(0);
  });

  it("activo de 12.000€, 48 meses → cuota mensual 250€", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([buildAsset()]);

    const result = await runMonthlyDepreciation(mockDb as any, 2026, 3);
    expect(result.assetsProcessed).toBe(1);
    expect(result.entriesCreated).toBe(1);
    expect(result.totalDepreciation).toBe(250);
  });

  it("crea JournalEntry con tipo AUTO_DEPRECIATION", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([buildAsset({
      acquisitionCost: 3600,
      monthlyDepreciation: 75,
      accumulatedDepreciation: 150,
      netBookValue: 3450,
      lastDepreciationDate: new Date("2026-02-01"),
    })]);

    await runMonthlyDepreciation(mockDb as any, 2026, 3);

    expect(mockDb.journalEntry.create).toHaveBeenCalledTimes(1);
    const createCall = mockDb.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.type).toBe("AUTO_DEPRECIATION");
    expect(createCall.data.status).toBe("POSTED");
  });

  it("activo totalmente amortizado → skip, marca FULLY_DEPRECIATED", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([buildAsset({
      accumulatedDepreciation: 12000,
      netBookValue: 0,
    })]);

    const result = await runMonthlyDepreciation(mockDb as any, 2026, 3);
    expect(result.entriesCreated).toBe(0);
    expect(mockDb.fixedAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FULLY_DEPRECIATED" }) })
    );
  });

  it("valor residual se resta del cálculo", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([buildAsset({
      acquisitionCost: 18000,
      residualValue: 3000,
      usefulLifeMonths: 96,
      monthlyDepreciation: 156.25, // (18000-3000)/96
    })]);

    const result = await runMonthlyDepreciation(mockDb as any, 2026, 3);
    expect(result.totalDepreciation).toBeCloseTo(156.25, 1);
  });

  it("ya amortizado este mes → skip (no duplicar)", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([buildAsset({
      lastDepreciationDate: new Date("2026-03-28"),
    })]);

    const result = await runMonthlyDepreciation(mockDb as any, 2026, 3);
    expect(result.entriesCreated).toBe(0);
  });

  it("actualiza accumulatedDepreciation y netBookValue del activo", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([buildAsset({
      accumulatedDepreciation: 500,
      netBookValue: 11500,
    })]);

    await runMonthlyDepreciation(mockDb as any, 2026, 3);

    expect(mockDb.fixedAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accumulatedDepreciation: 750, // 500 + 250
          netBookValue: 11250,          // 12000 - 750
        }),
      })
    );
  });

  it("errores en un activo no detienen los demás", async () => {
    mockDb.fixedAsset.findMany.mockResolvedValue([
      buildAsset({ id: "asset_bad", depreciationAccount: { id: null, code: null } }),
      buildAsset({ id: "asset_ok", monthlyDepreciation: 100 }),
    ]);

    mockDb.journalEntry.create
      .mockRejectedValueOnce(new Error("missing account"))
      .mockResolvedValueOnce({ id: "je_2" });

    const result = await runMonthlyDepreciation(mockDb as any, 2026, 3);
    expect(result.errors).toHaveLength(1);
    expect(result.entriesCreated).toBe(1);
  });
});
