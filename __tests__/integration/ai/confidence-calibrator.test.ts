import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma (global)
const mockPrisma = vi.hoisted(() => ({
  confidenceAdjustment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import {
  calibrateFromDecision,
  getPatternAdjustment,
  isCategoryPaused,
} from "@/lib/ai/confidence-calibrator";

describe("Confidence Calibrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.confidenceAdjustment.findUnique.mockResolvedValue(null);
    mockPrisma.confidenceAdjustment.findFirst.mockResolvedValue(null);
    mockPrisma.confidenceAdjustment.upsert.mockResolvedValue({});
    mockPrisma.confidenceAdjustment.update.mockResolvedValue({});
    mockPrisma.confidenceAdjustment.findMany.mockResolvedValue([]);
  });

  it("error auto-execute → persiste adjustment negativo", async () => {
    mockPrisma.confidenceAdjustment.findUnique.mockResolvedValue({
      id: "ca_1", adjustment: 0, errors30d: 0, lastErrorAt: null, pausedUntil: null,
    });

    await calibrateFromDecision({
      wasAutoExecuted: true,
      wasModified: true,
      category: "exact_match",
      patternKey: "iban:ES1234",
      companyId: "company_1",
    });

    expect(mockPrisma.confidenceAdjustment.upsert).toHaveBeenCalled();
  });

  it("aprobado sin cambio → persiste adjustment positivo", async () => {
    mockPrisma.confidenceAdjustment.findUnique.mockResolvedValue({
      id: "ca_1", adjustment: 0, errors30d: 0, lastErrorAt: null, pausedUntil: null,
    });

    await calibrateFromDecision({
      wasAutoExecuted: false,
      wasModified: false,
      category: "fuzzy_match",
      patternKey: "concept:PAGO PROVEEDOR",
      companyId: "company_1",
    });

    expect(mockPrisma.confidenceAdjustment.upsert).toHaveBeenCalled();
  });

  it("sin patternKey → no hace nada", async () => {
    await calibrateFromDecision({
      wasAutoExecuted: true,
      wasModified: true,
      category: "exact_match",
      patternKey: "",
      companyId: "company_1",
    });

    expect(mockPrisma.confidenceAdjustment.upsert).not.toHaveBeenCalled();
  });

  it("getPatternAdjustment devuelve 0 si no existe", async () => {
    mockPrisma.confidenceAdjustment.findUnique.mockResolvedValue(null);
    const adj = await getPatternAdjustment("company_1", "exact_match", "iban:ES1234");
    expect(adj).toBe(0);
  });

  it("getPatternAdjustment devuelve el valor persistido", async () => {
    mockPrisma.confidenceAdjustment.findUnique.mockResolvedValue({ adjustment: -0.15 });
    const adj = await getPatternAdjustment("company_1", "exact_match", "iban:ES1234");
    expect(adj).toBe(-0.15);
  });

  it("isCategoryPaused devuelve false si no hay pausa", async () => {
    mockPrisma.confidenceAdjustment.findFirst.mockResolvedValue(null);
    const paused = await isCategoryPaused("company_1", "exact_match");
    expect(paused).toBe(false);
  });
});
