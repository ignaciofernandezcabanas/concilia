import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  controllerDecision: { findMany: vi.fn() },
  learnedPattern: { findMany: vi.fn() },
};

import { getRelevantContext, formatContextForPrompt, type RetrievedContext } from "@/lib/ai/context-retriever";

describe("Context Retriever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.controllerDecision.findMany.mockResolvedValue([]);
    mockDb.learnedPattern.findMany.mockResolvedValue([]);
  });

  it("tx con IBAN conocido → sameCounterpart no vacío", async () => {
    mockDb.controllerDecision.findMany
      // Query 1: same IBAN
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-03-01"),
          bankConcept: "PAGO TECH SOLUTIONS",
          controllerAction: "classify:629",
          systemProposal: "classify:623",
          wasModified: true,
          amountRange: "500-5000",
        },
      ])
      // Query 2: similar concept
      .mockResolvedValueOnce([]);

    const ctx = await getRelevantContext(
      { counterpartIban: "ES1234", counterpartName: "TECH SOLUTIONS", concept: "PAGO TECH", amount: -1200 },
      mockDb as any
    );

    expect(ctx.sameCounterpart.length).toBe(1);
    expect(ctx.sameCounterpart[0].controllerAction).toBe("classify:629");
  });

  it("tx con IBAN desconocido → sameCounterpart vacío", async () => {
    mockDb.controllerDecision.findMany.mockResolvedValue([]);

    const ctx = await getRelevantContext(
      { counterpartIban: null, counterpartName: null, concept: "ALGO", amount: -100 },
      mockDb as any
    );

    expect(ctx.sameCounterpart.length).toBe(0);
  });

  it("tx con concepto similar → similarConcept no vacío", async () => {
    mockDb.controllerDecision.findMany
      // Query 2: concept candidates (query 1 skipped because no IBAN)
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-02-15"),
          bankConcept: "PAGO SERVICIOS CLOUD AWS",
          controllerAction: "classify:629",
          systemProposal: "classify:629",
          wasModified: false,
          amountRange: "100-500",
        },
        {
          createdAt: new Date("2026-01-15"),
          bankConcept: "NOMINA EMPLEADO GARCIA",
          controllerAction: "classify:640",
          systemProposal: "classify:640",
          wasModified: false,
          amountRange: "500-5000",
        },
      ]);

    const ctx = await getRelevantContext(
      { counterpartIban: null, counterpartName: null, concept: "PAGO SERVICIOS CLOUD AWS", amount: -200 },
      mockDb as any
    );

    expect(ctx.similarConcept.length).toBeGreaterThanOrEqual(1);
    expect(ctx.similarConcept[0].concept).toContain("CLOUD");
  });

  it("tx con concepto único → similarConcept vacío", async () => {
    mockDb.controllerDecision.findMany
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-01-01"),
          bankConcept: "NOMINA EMPLEADO GARCIA",
          controllerAction: "classify:640",
          systemProposal: "classify:640",
          wasModified: false,
          amountRange: "500-5000",
        },
      ]);

    const ctx = await getRelevantContext(
      { counterpartIban: null, counterpartName: null, concept: "XYZABCDEF123UNIQUE", amount: -50 },
      mockDb as any
    );

    expect(ctx.similarConcept.length).toBe(0);
  });

  it("LearnedPattern activo → aparece en activePatterns", async () => {
    mockDb.controllerDecision.findMany.mockResolvedValue([]);
    mockDb.learnedPattern.findMany.mockResolvedValue([
      {
        predictedAction: "classify",
        predictedAccount: "629",
        confidence: 0.92,
        occurrences: 8,
      },
    ]);

    const ctx = await getRelevantContext(
      { counterpartIban: "ES1234", counterpartName: "TECH", concept: "PAGO", amount: -100 },
      mockDb as any
    );

    expect(ctx.activePatterns.length).toBe(1);
    expect(ctx.activePatterns[0].predictedAccount).toBe("629");
  });

  it("LearnedPattern REJECTED → NO aparece (filtered by query)", async () => {
    // The query filters by status IN ('ACTIVE_SUPERVISED', 'PROMOTED')
    // REJECTED patterns won't be returned by Prisma
    mockDb.controllerDecision.findMany.mockResolvedValue([]);
    mockDb.learnedPattern.findMany.mockResolvedValue([]); // empty = nothing active

    const ctx = await getRelevantContext(
      { counterpartIban: "ES1234", counterpartName: "TECH", concept: "PAGO", amount: -100 },
      mockDb as any
    );

    expect(ctx.activePatterns.length).toBe(0);
  });

  it("formatContextForPrompt sin resultados → vacío", () => {
    const ctx: RetrievedContext = { sameCounterpart: [], similarConcept: [], activePatterns: [], totalFound: 0 };
    expect(formatContextForPrompt(ctx)).toBe("");
  });

  it("formatContextForPrompt con resultados → contiene <controller_decisions>", () => {
    const ctx: RetrievedContext = {
      sameCounterpart: [{
        date: "2026-03-01",
        concept: "PAGO TECH",
        amount: -1200,
        systemProposal: "classify:623",
        controllerAction: "classify:629",
        wasModified: true,
        accountCode: "629",
      }],
      similarConcept: [],
      activePatterns: [],
      totalFound: 1,
    };

    const formatted = formatContextForPrompt(ctx);
    expect(formatted).toContain("<controller_decisions>");
    expect(formatted).toContain("</controller_decisions>");
    expect(formatted).toContain("629");
    expect(formatted).toContain("controller: classify:629");
  });
});
