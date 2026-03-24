import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──
const mockPrisma = vi.hoisted(() => ({
  company: { findMany: vi.fn() },
  bankTransaction: { findMany: vi.fn() },
  journalEntry: { count: vi.fn() },
  intercompanyLink: { count: vi.fn() },
  accountingPeriod: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const mockCallAI = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/model-router", () => ({
  callAI: mockCallAI,
}));

import { generateDailyBriefing } from "@/lib/ai/briefing";
import { detectAnomalies } from "@/lib/ai/anomaly-detector";
import { generateCloseProposal } from "@/lib/ai/close-proposal";

describe("Daily Briefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("contiene nombre del grupo", async () => {
    mockCallAI.mockResolvedValue("Briefing para Grupo Acme: todo en orden.");

    const result = await generateDailyBriefing(
      "Grupo Acme",
      {
        companiesProcessed: 2,
        txsProcessed: 10,
        txsAutoExecuted: 8,
        txsToBandeja: 2,
        llmCallsTotal: 3,
        errorsCount: 0,
        stepErrors: [],
      },
      [{ weekStart: "2026-03-23", projectedBalance: 50000 }],
      [],
      5,
      null
    );

    expect(result).toContain("Grupo Acme");
    // Verify callAI was called with daily_briefing task
    expect(mockCallAI).toHaveBeenCalledWith(
      "daily_briefing",
      expect.any(String),
      expect.stringContaining("Grupo Acme")
    );
  });

  it("menciona anomalías cuando existen", async () => {
    mockCallAI.mockResolvedValue("Briefing con anomalías detectadas.");

    await generateDailyBriefing(
      "Test Org",
      {
        companiesProcessed: 1,
        txsProcessed: 5,
        txsAutoExecuted: 3,
        txsToBandeja: 2,
        llmCallsTotal: 1,
        errorsCount: 0,
        stepErrors: [],
      },
      null,
      [
        {
          companyId: "c1",
          companyName: "A",
          accountCode: "628",
          accountName: "Suministros",
          currentAmount: 5000,
          avgAmount: 1000,
          zScore: 4.0,
          explanation: "Gasto muy alto",
        },
      ],
      0,
      null
    );

    // User prompt should contain the anomaly data
    expect(mockCallAI).toHaveBeenCalledWith(
      "daily_briefing",
      expect.any(String),
      expect.stringContaining("628")
    );
  });

  it("no menciona anomalías cuando no hay", async () => {
    mockCallAI.mockResolvedValue("Todo normal.");

    await generateDailyBriefing(
      "Test Org",
      {
        companiesProcessed: 1,
        txsProcessed: 5,
        txsAutoExecuted: 5,
        txsToBandeja: 0,
        llmCallsTotal: 0,
        errorsCount: 0,
        stepErrors: [],
      },
      null,
      [],
      0,
      null
    );

    expect(mockCallAI).toHaveBeenCalledWith(
      "daily_briefing",
      expect.any(String),
      expect.stringContaining("Sin anomalías")
    );
  });
});

describe("Anomaly Detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cuenta con gasto 3x media → z>2 → detectada", async () => {
    mockPrisma.company.findMany.mockResolvedValue([
      { id: "c1", name: "Company A", shortName: "A" },
    ]);

    // Current month: 3000 EUR in account 628
    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([
        {
          amount: -3000,
          valueDate: new Date("2026-03-15"),
          concept: "Electricidad",
          classification: { account: { code: "628", name: "Suministros" } },
        },
      ])
      .mockResolvedValueOnce([
        // 6 months of ~1000/month
        {
          amount: -900,
          valueDate: new Date("2025-10-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1100,
          valueDate: new Date("2025-11-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1000,
          valueDate: new Date("2025-12-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -950,
          valueDate: new Date("2026-01-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1050,
          valueDate: new Date("2026-02-15"),
          classification: { account: { code: "628" } },
        },
      ])
      // For top tx lookup
      .mockResolvedValueOnce([{ amount: -3000, concept: "Electricidad" }]);

    mockCallAI.mockResolvedValue("Gasto eléctrico 3x por encima de la media.");

    const anomalies = await detectAnomalies("org_1", "2026-03");

    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].accountCode).toBe("628");
    expect(anomalies[0].zScore).toBeGreaterThan(2);
    expect(anomalies[0].explanation).toBeTruthy();
  });

  it("cuenta normal → no detectada", async () => {
    mockPrisma.company.findMany.mockResolvedValue([
      { id: "c1", name: "Company A", shortName: "A" },
    ]);

    // Current: 1000 (normal)
    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([
        {
          amount: -1000,
          valueDate: new Date("2026-03-15"),
          concept: "Normal",
          classification: { account: { code: "628", name: "Suministros" } },
        },
      ])
      .mockResolvedValueOnce([
        {
          amount: -900,
          valueDate: new Date("2025-10-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1100,
          valueDate: new Date("2025-11-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1000,
          valueDate: new Date("2025-12-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -950,
          valueDate: new Date("2026-01-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1050,
          valueDate: new Date("2026-02-15"),
          classification: { account: { code: "628" } },
        },
      ]);

    const anomalies = await detectAnomalies("org_1", "2026-03");

    expect(anomalies.length).toBe(0);
  });

  it("<3 meses historial → ignorada", async () => {
    mockPrisma.company.findMany.mockResolvedValue([
      { id: "c1", name: "Company A", shortName: "A" },
    ]);

    mockPrisma.bankTransaction.findMany
      .mockResolvedValueOnce([
        {
          amount: -5000,
          valueDate: new Date("2026-03-15"),
          concept: "Big",
          classification: { account: { code: "628", name: "Suministros" } },
        },
      ])
      .mockResolvedValueOnce([
        // Only 2 months of history
        {
          amount: -1000,
          valueDate: new Date("2026-01-15"),
          classification: { account: { code: "628" } },
        },
        {
          amount: -1000,
          valueDate: new Date("2026-02-15"),
          classification: { account: { code: "628" } },
        },
      ]);

    const anomalies = await detectAnomalies("org_1", "2026-03");

    expect(anomalies.length).toBe(0);
  });
});

describe("Close Proposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista companies no cerradas", async () => {
    mockPrisma.company.findMany.mockResolvedValue([
      { id: "c1", name: "Alpha S.L.", shortName: "Alpha" },
      { id: "c2", name: "Beta S.L.", shortName: "Beta" },
    ]);
    mockPrisma.journalEntry.count.mockResolvedValue(3);
    mockPrisma.intercompanyLink.count.mockResolvedValue(1);
    mockPrisma.accountingPeriod.findMany.mockResolvedValue([
      { company: { shortName: "Alpha", name: "Alpha S.L." } },
    ]);
    mockPrisma.bankTransaction = {
      ...mockPrisma.bankTransaction,
      count: vi.fn().mockResolvedValue(5),
    } as any;

    mockCallAI.mockResolvedValue("Propuesta de cierre: Alpha pendiente de cerrar.");

    const result = await generateCloseProposal("org_1", "Test Org", "2026-02");

    expect(result).toContain("Alpha");
    expect(mockCallAI).toHaveBeenCalledWith(
      "close_proposal",
      expect.any(String),
      expect.stringContaining("Alpha")
    );
  });

  it("menciona interco pendiente", async () => {
    mockPrisma.company.findMany.mockResolvedValue([{ id: "c1", name: "A", shortName: "A" }]);
    mockPrisma.journalEntry.count.mockResolvedValue(0);
    mockPrisma.intercompanyLink.count.mockResolvedValue(4);
    mockPrisma.accountingPeriod.findMany.mockResolvedValue([]);
    mockPrisma.bankTransaction = {
      ...mockPrisma.bankTransaction,
      count: vi.fn().mockResolvedValue(0),
    } as any;

    mockCallAI.mockResolvedValue("4 operaciones intercompañía pendientes.");

    const result = await generateCloseProposal("org_1", "Test Org", "2026-02");

    expect(mockCallAI).toHaveBeenCalledWith(
      "close_proposal",
      expect.any(String),
      expect.stringContaining("pendingIntercompany")
    );
  });
});
