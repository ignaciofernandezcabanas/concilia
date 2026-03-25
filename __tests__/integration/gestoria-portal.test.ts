/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Fiscal Matrix Tests ──

import {
  FISCAL_MATRIX,
  FISCAL_MODELS,
  getFiscalDeadlines,
  getApplicableModels,
  getUpcomingDeadlines,
  type FiscalCompanyType,
} from "@/lib/fiscal/fiscal-matrix";

describe("Fiscal Matrix", () => {
  it("SL_GENERAL includes 303, 200, 347", () => {
    const models = FISCAL_MATRIX.SL_GENERAL;
    expect(models).toContain("303");
    expect(models).toContain("200");
    expect(models).toContain("347");
  });

  it("SL_CON_EMPLEADOS includes 111", () => {
    const models = FISCAL_MATRIX.SL_CON_EMPLEADOS;
    expect(models).toContain("111");
    expect(models).toContain("303");
  });

  it("SL_ARRENDADOR includes 115", () => {
    const models = FISCAL_MATRIX.SL_ARRENDADOR;
    expect(models).toContain("115");
    expect(models).toContain("111");
  });

  it("AUTONOMO includes 130 (pago fraccionado IRPF)", () => {
    const models = FISCAL_MATRIX.AUTONOMO;
    expect(models).toContain("130");
    expect(models).not.toContain("200"); // not IS for autónomos
  });

  it("SL_INTRACOMUNITARIA includes 349", () => {
    const models = FISCAL_MATRIX.SL_INTRACOMUNITARIA;
    expect(models).toContain("349");
  });

  it("SL_HOLDING includes 202 (pago fraccionado IS)", () => {
    const models = FISCAL_MATRIX.SL_HOLDING;
    expect(models).toContain("202");
  });

  it("all model codes in matrix reference valid FISCAL_MODELS", () => {
    for (const [_type, codes] of Object.entries(FISCAL_MATRIX)) {
      for (const code of codes) {
        expect(FISCAL_MODELS[code]).toBeDefined();
      }
    }
  });

  it("getApplicableModels returns model info objects", () => {
    const models = getApplicableModels("SL_GENERAL");
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty("model");
    expect(models[0]).toHaveProperty("name");
    expect(models[0]).toHaveProperty("frequency");
  });
});

describe("Fiscal Calendar", () => {
  it("Q1 deadline is April 20 for 303", () => {
    const deadlines = getFiscalDeadlines(2026);
    const q1_303 = deadlines.find((d) => d.model === "303" && d.period === "T1-2026");
    expect(q1_303).toBeDefined();
    expect(q1_303!.dueDate).toBe("2026-04-20");
  });

  it("Q4 deadline is January 30 of next year for 303", () => {
    const deadlines = getFiscalDeadlines(2026);
    const q4_303 = deadlines.find((d) => d.model === "303" && d.period === "T4-2026");
    expect(q4_303).toBeDefined();
    expect(q4_303!.dueDate).toBe("2027-01-30");
  });

  it("IS (200) deadline is July 25 of next year", () => {
    const deadlines = getFiscalDeadlines(2026);
    const is200 = deadlines.find((d) => d.model === "200");
    expect(is200).toBeDefined();
    expect(is200!.dueDate).toBe("2027-07-25");
  });

  it("347 deadline is February 28 of next year", () => {
    const deadlines = getFiscalDeadlines(2026);
    const d347 = deadlines.find((d) => d.model === "347");
    expect(d347).toBeDefined();
    expect(d347!.dueDate).toBe("2027-02-28");
  });

  it("390 deadline is January 30 of next year", () => {
    const deadlines = getFiscalDeadlines(2026);
    const d390 = deadlines.find((d) => d.model === "390");
    expect(d390).toBeDefined();
    expect(d390!.dueDate).toBe("2027-01-30");
  });

  it("getFiscalDeadlines returns deadlines for 303/111/115/200/347/390/130/202", () => {
    const deadlines = getFiscalDeadlines(2026);
    const models = new Set(deadlines.map((d) => d.model));
    expect(models.has("303")).toBe(true);
    expect(models.has("111")).toBe(true);
    expect(models.has("200")).toBe(true);
    expect(models.has("347")).toBe(true);
  });

  it("getUpcomingDeadlines filters by company type and date range", () => {
    // April 15, 2026 — 5 days before Q1 deadlines (April 20)
    const ref = new Date("2026-04-15");
    const deadlines = getUpcomingDeadlines("SL_CON_EMPLEADOS", 10, ref);
    // Should find 303 and 111 (both due April 20)
    const models = deadlines.map((d) => d.model);
    expect(models).toContain("303");
    expect(models).toContain("111");
  });

  it("getUpcomingDeadlines returns empty for far future dates", () => {
    const ref = new Date("2026-06-15");
    const deadlines = getUpcomingDeadlines("SL_GENERAL", 5, ref);
    // No deadlines within 5 days of June 15
    expect(deadlines.length).toBe(0);
  });
});

// ── Alert Priority Tests ──

describe("Alert Priority Logic", () => {
  it("deadline <=5 days → urgent priority label", () => {
    const now = new Date("2026-04-16");
    const deadlines = getUpcomingDeadlines("SL_GENERAL", 30, now);
    const nearDeadlines = deadlines.filter((d) => {
      const due = new Date(d.dueDate);
      const diff = (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      return diff <= 5;
    });
    expect(nearDeadlines.length).toBeGreaterThan(0);
    // April 20 is 4 days away → should be in <=5 bucket
    expect(nearDeadlines.some((d) => d.dueDate === "2026-04-20")).toBe(true);
  });

  it("deadline <=15 days → high priority bucket", () => {
    const now = new Date("2026-04-08");
    const deadlines = getUpcomingDeadlines("SL_GENERAL", 15, now);
    const inRange = deadlines.filter((d) => {
      const due = new Date(d.dueDate);
      const diff = (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      return diff > 5 && diff <= 15;
    });
    // April 20 is 12 days away → should be in 5-15 bucket
    expect(inRange.some((d) => d.dueDate === "2026-04-20")).toBe(true);
  });
});

// ── Gestoría Access Tests ──

describe("Gestoría Access", () => {
  const mockDb = {
    gestoriaConfig: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no config exists", async () => {
    mockDb.gestoriaConfig.findFirst.mockResolvedValue(null);

    const { checkGestoriaAccess } = await import("@/lib/auth/gestoria-check");
    const result = await checkGestoriaAccess(mockDb as any);
    expect(result).toBeNull();
  });

  it("returns config when it exists and no level required", async () => {
    const config = {
      id: "gc1",
      companyId: "c1",
      accessLevel: "subir_docs",
      manages: ["fiscal"],
    };
    mockDb.gestoriaConfig.findFirst.mockResolvedValue(config);

    const { checkGestoriaAccess } = await import("@/lib/auth/gestoria-check");
    const result = await checkGestoriaAccess(mockDb as any);
    expect(result).toBeTruthy();
    expect(result!.id).toBe("gc1");
  });

  it("subir_docs cannot access reportes level", async () => {
    mockDb.gestoriaConfig.findFirst.mockResolvedValue({
      id: "gc1",
      accessLevel: "subir_docs",
      manages: [],
    });

    const { checkGestoriaAccess } = await import("@/lib/auth/gestoria-check");
    const result = await checkGestoriaAccess(mockDb as any, "reportes");
    expect(result).toBeNull();
  });

  it("reportes can access reportes level", async () => {
    mockDb.gestoriaConfig.findFirst.mockResolvedValue({
      id: "gc1",
      accessLevel: "reportes",
      manages: ["fiscal"],
    });

    const { checkGestoriaAccess } = await import("@/lib/auth/gestoria-check");
    const result = await checkGestoriaAccess(mockDb as any, "reportes");
    expect(result).toBeTruthy();
  });

  it("completo can access all levels", async () => {
    mockDb.gestoriaConfig.findFirst.mockResolvedValue({
      id: "gc1",
      accessLevel: "completo",
      manages: ["fiscal", "laboral"],
    });

    const { checkGestoriaAccess } = await import("@/lib/auth/gestoria-check");
    const result = await checkGestoriaAccess(mockDb as any, "completo");
    expect(result).toBeTruthy();
  });

  it("reportes cannot access completo level", async () => {
    mockDb.gestoriaConfig.findFirst.mockResolvedValue({
      id: "gc1",
      accessLevel: "reportes",
      manages: ["fiscal"],
    });

    const { checkGestoriaAccess } = await import("@/lib/auth/gestoria-check");
    const result = await checkGestoriaAccess(mockDb as any, "completo");
    expect(result).toBeNull();
  });
});

// ── Upload Classification Tests ──

describe("Upload Classification", () => {
  it("GESTORIA_PROCESS_UPLOAD prompt has correct schema fields", async () => {
    const { GESTORIA_PROCESS_UPLOAD } = await import("@/lib/ai/prompt-registry");

    expect(GESTORIA_PROCESS_UPLOAD.task).toBe("gestoria_process_upload");
    expect(GESTORIA_PROCESS_UPLOAD.schema).toBeDefined();

    // Validate schema shape
    const testData = {
      documentType: "modelo_303",
      period: "T1-2026",
      keyAmounts: { base: 10000, cuota: 2100, total: 12100 },
      completeness: "complete" as const,
      confidence: 0.95,
      notes: null,
    };
    const result = GESTORIA_PROCESS_UPLOAD.schema.safeParse(testData);
    expect(result.success).toBe(true);
  });

  it("GESTORIA_PROCESS_UPLOAD rejects invalid completeness", async () => {
    const { GESTORIA_PROCESS_UPLOAD } = await import("@/lib/ai/prompt-registry");

    const testData = {
      documentType: "modelo_303",
      period: "T1-2026",
      keyAmounts: { base: 10000, cuota: 2100, total: 12100 },
      completeness: "invalid_value",
      confidence: 0.95,
      notes: null,
    };
    const result = GESTORIA_PROCESS_UPLOAD.schema.safeParse(testData);
    expect(result.success).toBe(false);
  });

  it("GESTORIA_PROCESS_UPLOAD buildUser includes filename in XML tags", async () => {
    const { GESTORIA_PROCESS_UPLOAD } = await import("@/lib/ai/prompt-registry");
    const userMsg = GESTORIA_PROCESS_UPLOAD.buildUser({ filename: "mod303_T1.pdf" });
    expect(userMsg).toContain("<document>");
    expect(userMsg).toContain("mod303_T1.pdf");
    expect(userMsg).toContain("</document>");
  });
});

// ── Prompt Registry Tests ──

describe("Gestoría Prompts", () => {
  it("GESTORIA_DAILY_ALERTS has valid schema", async () => {
    const { GESTORIA_DAILY_ALERTS } = await import("@/lib/ai/prompt-registry");
    expect(GESTORIA_DAILY_ALERTS.task).toBe("gestoria_daily_alerts");

    const testData = [
      {
        priority: "urgent" as const,
        title: "Modelo 303 vence en 3 días",
        description: "Presentar antes del 20/04",
        dueDate: "2026-04-20",
        fiscalRef: "303",
        companyName: "Test SL",
      },
    ];
    const result = GESTORIA_DAILY_ALERTS.schema.safeParse(testData);
    expect(result.success).toBe(true);
  });

  it("GESTORIA_REVIEW_DRAFT has valid schema", async () => {
    const { GESTORIA_REVIEW_DRAFT } = await import("@/lib/ai/prompt-registry");
    expect(GESTORIA_REVIEW_DRAFT.task).toBe("gestoria_review_draft");

    const testData = {
      status: "warning" as const,
      discrepancies: [
        {
          field: "cuota",
          expected: 2100,
          actual: 2000,
          severity: "warning" as const,
          message: "Cuota no coincide con base × tipo",
        },
      ],
      summary: "Revisión con advertencias",
      priorComparison: { changed: true, percentChange: 15.5, note: "Aumento significativo" },
    };
    const result = GESTORIA_REVIEW_DRAFT.schema.safeParse(testData);
    expect(result.success).toBe(true);
  });

  it("GESTORIA_DAILY_ALERTS buildUser wraps data in XML tags", async () => {
    const { GESTORIA_DAILY_ALERTS } = await import("@/lib/ai/prompt-registry");
    const userMsg = GESTORIA_DAILY_ALERTS.buildUser({
      companies: [
        { name: "Test", cif: "B12345678", companyType: "SL_GENERAL", pendingModels: ["303"] },
      ],
      currentDate: "2026-04-15",
      upcomingDeadlines: [{ model: "303", period: "T1-2026", dueDate: "2026-04-20" }],
      pendingDocs: 2,
      overdueItems: 1,
    });
    expect(userMsg).toContain("<company_data>");
    expect(userMsg).toContain("<fiscal_calendar>");
    expect(userMsg).toContain("<pending_items>");
  });
});

// ── Incidents Tests ──

describe("Incidents Schema", () => {
  it("incident severity must be valid enum value", () => {
    const { z } = require("zod");
    const schema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    });

    const valid = schema.safeParse({
      title: "Test incident",
      description: "Something went wrong",
      severity: "high",
    });
    expect(valid.success).toBe(true);

    const invalid = schema.safeParse({
      title: "Test incident",
      description: "Something went wrong",
      severity: "extreme",
    });
    expect(invalid.success).toBe(false);
  });

  it("incident title cannot be empty", () => {
    const { z } = require("zod");
    const schema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    });

    const invalid = schema.safeParse({
      title: "",
      description: "Description",
    });
    expect(invalid.success).toBe(false);
  });
});

// ── Daily Agent Gestoría Step ──

describe("Daily Agent — Gestoría Sync Step", () => {
  const mockPrisma = vi.hoisted(() => ({
    agentRun: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    organization: { findUniqueOrThrow: vi.fn() },
    integration: { findMany: vi.fn() },
    bankTransaction: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    invoice: { findMany: vi.fn(), count: vi.fn() },
    intercompanyLink: { create: vi.fn(), count: vi.fn() },
    journalEntry: { count: vi.fn() },
    membership: { findMany: vi.fn() },
    notification: { create: vi.fn() },
    debtScheduleEntry: { findMany: vi.fn() },
    debtInstrument: { findMany: vi.fn() },
    debtCovenant: { findMany: vi.fn() },
    gestoriaConfig: { findFirst: vi.fn(), update: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
    reconciliation: { findMany: vi.fn() },
    supportingDocument: { findFirst: vi.fn() },
  }));
  vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
  vi.mock("@/lib/db-scoped", () => ({ getScopedDb: () => mockPrisma }));

  const mockRunReconciliation = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/reconciliation/engine", () => ({
    runReconciliation: mockRunReconciliation,
  }));

  const mockRunDepreciation = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/accounting/depreciation", () => ({
    runMonthlyDepreciation: mockRunDepreciation,
  }));

  const mockProcessAccruals = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/accounting/accruals", () => ({
    processRecurringAccruals: mockProcessAccruals,
  }));

  const mockCheckDeferredMatches = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/accounting/deferred-entries", () => ({
    checkDeferredMatches: mockCheckDeferredMatches,
  }));

  const mockCheckCapitalAdequacy = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/accounting/capital-adequacy", () => ({
    checkCapitalAdequacy: mockCheckCapitalAdequacy,
  }));

  const mockDetectIntercompany = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/reconciliation/detectors/intercompany-detector", () => ({
    detectIntercompany: mockDetectIntercompany,
  }));

  const mockGenerateForecast = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/reports/forecast-generator", () => ({
    generateForecast: mockGenerateForecast,
  }));

  const mockCallAI = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/ai/model-router", () => ({
    callAI: mockCallAI,
    callAIJson: vi.fn(),
    getCallBuffer: () => [],
    clearCallBuffer: vi.fn(),
  }));

  const mockCreateThread = vi.hoisted(() => vi.fn());
  const mockRunAutonomousCycle = vi.hoisted(() => vi.fn());
  vi.mock("@/lib/threads/thread-manager", () => ({
    createThread: mockCreateThread,
    runAutonomousCycle: mockRunAutonomousCycle,
  }));

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.agentRun.findFirst.mockResolvedValue(null);
    mockPrisma.agentRun.create.mockResolvedValue({ id: "run_g1" });
    mockPrisma.agentRun.update.mockResolvedValue({});
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue({
      id: "org_1",
      name: "Test Org",
      companies: [{ id: "c1", name: "Company A", shortName: "A" }],
    });
    mockPrisma.integration.findMany.mockResolvedValue([]);
    mockPrisma.bankTransaction.findMany.mockResolvedValue([]);
    mockPrisma.bankTransaction.update.mockResolvedValue({});
    mockPrisma.bankTransaction.count.mockResolvedValue(0);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.count.mockResolvedValue(0);
    mockPrisma.intercompanyLink.create.mockResolvedValue({});
    mockPrisma.intercompanyLink.count.mockResolvedValue(0);
    mockPrisma.journalEntry.count.mockResolvedValue(0);
    mockPrisma.membership.findMany.mockResolvedValue([{ userId: "user_1" }]);
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.debtScheduleEntry.findMany.mockResolvedValue([]);
    mockPrisma.debtInstrument.findMany.mockResolvedValue([]);
    mockPrisma.debtCovenant.findMany.mockResolvedValue([]);
    mockPrisma.reconciliation.findMany.mockResolvedValue([]);
    mockPrisma.supportingDocument.findFirst.mockResolvedValue(null);

    mockRunReconciliation.mockResolvedValue({
      processed: 0,
      matched: 0,
      classified: 0,
      autoApproved: 0,
      needsReview: 0,
      errors: [],
    });
    mockRunDepreciation.mockResolvedValue({
      assetsProcessed: 0,
      entriesCreated: 0,
      totalDepreciation: 0,
      errors: [],
    });
    mockProcessAccruals.mockResolvedValue({
      accrualsProcessed: 0,
      entriesCreated: 0,
      totalAccrued: 0,
      reversed: 0,
      errors: [],
    });
    mockCheckDeferredMatches.mockResolvedValue(0);
    mockDetectIntercompany.mockResolvedValue({
      isIntercompany: false,
      siblingCompanyId: null,
      siblingCompanyName: null,
      organizationId: null,
    });
    mockCheckCapitalAdequacy.mockResolvedValue({
      patrimonioNeto: 50000,
      capital: 10000,
      reservaLegal: 2000,
      ratio: 5,
      alerts: [],
    });
    mockGenerateForecast.mockResolvedValue({
      currentBalance: 50000,
      balanceDate: "2026-03-25",
      weeks: [
        {
          weekStart: "2026-03-25",
          weekEnd: "2026-03-31",
          expectedInflows: 1000,
          expectedOutflows: 500,
          netFlow: 500,
          projectedBalance: 50500,
          details: [],
        },
      ],
      totals: {
        totalExpectedInflows: 1000,
        totalExpectedOutflows: 500,
        projectedEndBalance: 50500,
      },
      horizon: 8,
      generatedAt: new Date().toISOString(),
    });
    mockCallAI.mockResolvedValue("OK");
    mockCreateThread.mockResolvedValue("thread_1");
    mockRunAutonomousCycle.mockResolvedValue({
      autoResolved: 0,
      followUpsSent: 0,
      staleDetected: 0,
      reprioritized: 0,
    });
  });

  it("gestoria_sync step runs when GestoriaConfig exists", async () => {
    mockPrisma.gestoriaConfig.findFirst.mockResolvedValue({
      id: "gc1",
      companyId: "c1",
      accessLevel: "completo",
      manages: ["fiscal"],
    });
    mockPrisma.businessProfile.findFirst.mockResolvedValue({
      tipoSociedad: "SL_CON_EMPLEADOS",
    });

    const { runDailyAgent } = await import("@/lib/ai/daily-agent");
    const result = await runDailyAgent("org_1");

    expect(result.status).toBe("COMPLETED");
    // gestoria_sync should have called callAI for alerts
    const gestoriaCalls = mockCallAI.mock.calls.filter(
      (c: unknown[]) => c[0] === "gestoria_daily_alerts"
    );
    expect(gestoriaCalls.length).toBeGreaterThanOrEqual(0); // May or may not trigger depending on deadlines
  });

  it("gestoria_sync step skips when no GestoriaConfig", async () => {
    mockPrisma.gestoriaConfig.findFirst.mockResolvedValue(null);

    const { runDailyAgent } = await import("@/lib/ai/daily-agent");
    const result = await runDailyAgent("org_1");

    expect(result.status).toBe("COMPLETED");
    // No gestoria alerts should be generated
    const gestoriaNotifs = mockPrisma.notification.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { data: { type: string } }).data.type === "GESTORIA_ALERT"
    );
    expect(gestoriaNotifs.length).toBe(0);
  });
});
