import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  accountingPeriod: { findUnique: vi.fn() },
};

vi.mock("@/lib/db-scoped", () => ({
  getScopedDb: () => mockDb,
}));

import { checkPeriodOpen, getPeriodStatus } from "@/lib/utils/period-guard";

describe("Period Guard (blocking disabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("siempre permite escritura — periodo OPEN", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "OPEN" });
    const result = await checkPeriodOpen(mockDb as any, "company_1", new Date("2026-03-15"));
    expect(result).toBeNull();
  });

  it("siempre permite escritura — periodo CLOSED", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "CLOSED" });
    const result = await checkPeriodOpen(mockDb as any, "company_1", new Date("2026-01-15"));
    expect(result).toBeNull();
  });

  it("siempre permite escritura — periodo LOCKED", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "LOCKED" });
    const result = await checkPeriodOpen(mockDb as any, "company_1", new Date("2025-12-15"));
    expect(result).toBeNull();
  });

  it("siempre permite escritura — sin periodo", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue(null);
    const result = await checkPeriodOpen(mockDb as any, "company_1", new Date("2026-06-15"));
    expect(result).toBeNull();
  });

  it("getPeriodStatus devuelve OPEN por defecto si no existe", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue(null);
    const status = await getPeriodStatus(mockDb as any, "company_1", 2026, 6);
    expect(status).toBe("OPEN");
  });
});
