import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPeriodOpen, checkPeriodForAutoEntry } from "@/lib/utils/period-guard";

const mockDb = {
  accountingPeriod: {
    findUnique: vi.fn(),
  },
};

describe("Period Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("OPEN period allows all writes", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "OPEN" });
    const result = await checkPeriodOpen(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).toBeNull();
  });

  it("SOFT_CLOSED blocks manual writes", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "SOFT_CLOSED" });
    const result = await checkPeriodOpen(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).not.toBeNull();
    expect(result).toContain("cierre provisional");
  });

  it("SOFT_CLOSED allows auto entries (isAutoEntry=true)", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "SOFT_CLOSED" });
    const result = await checkPeriodOpen(mockDb as any, "c1", new Date("2026-03-15"), true);
    expect(result).toBeNull();
  });

  it("checkPeriodForAutoEntry allows SOFT_CLOSED", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "SOFT_CLOSED" });
    const result = await checkPeriodForAutoEntry(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).toBeNull();
  });

  it("CLOSED blocks all writes", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "CLOSED" });
    const result = await checkPeriodOpen(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).not.toBeNull();
    expect(result).toContain("cerrado");
  });

  it("LOCKED blocks all writes", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "LOCKED" });
    const result = await checkPeriodOpen(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).not.toBeNull();
    expect(result).toContain("bloqueado");
  });

  it("checkPeriodForAutoEntry blocks CLOSED", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue({ status: "CLOSED" });
    const result = await checkPeriodForAutoEntry(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).not.toBeNull();
  });

  it("no period record defaults to OPEN (allows writes)", async () => {
    mockDb.accountingPeriod.findUnique.mockResolvedValue(null);
    const result = await checkPeriodOpen(mockDb as any, "c1", new Date("2026-03-15"));
    expect(result).toBeNull();
  });
});
