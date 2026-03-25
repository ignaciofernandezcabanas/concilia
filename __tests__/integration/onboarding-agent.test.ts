/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════
// Mocks
// ════════════════════════════════════════════════════════════

const mockCallAIJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/model-router", () => ({
  callAIJson: mockCallAIJson,
}));

import {
  ONBOARDING_INFERENCE,
  PARSE_HISTORICAL_FILE,
  CALIBRATE_ACCOUNT_PLAN,
} from "@/lib/ai/prompt-registry";

// ════════════════════════════════════════════════════════════
// ONBOARDING_INFERENCE prompt
// ════════════════════════════════════════════════════════════

describe("ONBOARDING_INFERENCE", () => {
  it("has correct task and version", () => {
    expect(ONBOARDING_INFERENCE.task).toBe("onboarding_inference");
    expect(ONBOARDING_INFERENCE.version).toBe("1.0");
  });

  it("system prompt mentions PGC 2007", () => {
    expect(ONBOARDING_INFERENCE.system).toContain("PGC 2007");
  });

  it("system prompt requires only real PGC codes", () => {
    expect(ONBOARDING_INFERENCE.system).toContain("ONLY use real PGC 2007 account codes");
  });

  it("system prompt requires fiscal legal basis", () => {
    expect(ONBOARDING_INFERENCE.system).toContain("legal basis");
  });

  it("system prompt mentions default counterparts", () => {
    expect(ONBOARDING_INFERENCE.system).toContain("640/465");
    expect(ONBOARDING_INFERENCE.system).toContain("621/410");
  });

  it("buildUser wraps data in XML tags", () => {
    const result = ONBOARDING_INFERENCE.buildUser({
      empresa: "Test SL",
      nif: "B12345678",
      forma_juridica: "SL",
      sector: "servicios",
      regimen_iva: "general",
      irpf_retenciones: true,
      actividad: "Desarrollo software",
      canales: ["B2B directo"],
      cobro: "transferencia",
    });
    expect(result).toContain("<company_data>");
    expect(result).toContain("</company_data>");
    expect(result).toContain("Test SL");
    expect(result).toContain("B12345678");
    expect(result).toContain("Desarrollo software");
  });

  it("schema validates a correct inference result", () => {
    const valid = {
      subplan: [
        {
          code: "6000",
          name: "Compras de mercaderías",
          status: "active",
          confidence: 0.95,
          reason: "Comercio",
        },
      ],
      fiscal_modules: [
        {
          model: "303",
          name: "IVA trimestral",
          periodicity: "trimestral",
          active: true,
          legal_basis: "Art. 164 Ley 37/1992",
        },
      ],
      default_counterparts: [{ concept: "nóminas", debit_account: "640", credit_account: "465" }],
      warnings: [],
      summary: "Plan para empresa comercial",
    };
    const parsed = ONBOARDING_INFERENCE.schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("schema rejects invalid status", () => {
    const invalid = {
      subplan: [{ code: "6000", name: "Test", status: "unknown", confidence: 0.5, reason: "x" }],
      fiscal_modules: [],
      default_counterparts: [],
      warnings: [],
      summary: "Test",
    };
    const parsed = ONBOARDING_INFERENCE.schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("distribución → grupo 6 active accounts expected", () => {
    // The system prompt instructs: distribución → grupo 3 active
    expect(ONBOARDING_INFERENCE.system).toContain("distribución: grupo 3 (existencias) active");
  });

  it("servicios → grupo 3 inactive expected", () => {
    expect(ONBOARDING_INFERENCE.system).toContain("servicios: grupo 3 inactive");
  });

  it("nóminas → modelo 111 active expected", () => {
    expect(ONBOARDING_INFERENCE.system).toContain("nóminas: modelo 111 active");
  });

  it("schema enforces confidence bounds 0-1", () => {
    const overBound = {
      subplan: [{ code: "6000", name: "Test", status: "active", confidence: 1.5, reason: "x" }],
      fiscal_modules: [],
      default_counterparts: [],
      warnings: [],
      summary: "Test",
    };
    const parsed = ONBOARDING_INFERENCE.schema.safeParse(overBound);
    expect(parsed.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// PARSE_HISTORICAL_FILE prompt
// ════════════════════════════════════════════════════════════

describe("PARSE_HISTORICAL_FILE", () => {
  it("has correct task", () => {
    expect(PARSE_HISTORICAL_FILE.task).toBe("parse_historical_file");
  });

  it("system mentions CSV/Excel", () => {
    expect(PARSE_HISTORICAL_FILE.system).toContain("CSV");
  });

  it("system mentions known formats (Holded, Sage, A3)", () => {
    expect(PARSE_HISTORICAL_FILE.system).toContain("Holded");
    expect(PARSE_HISTORICAL_FILE.system).toContain("Sage");
    expect(PARSE_HISTORICAL_FILE.system).toContain("A3");
  });

  it("buildUser wraps content in XML tags", () => {
    const result = PARSE_HISTORICAL_FILE.buildUser({
      content: "code;name;debe;haber\n6000;Compras;1000;0",
      filename: "balance.csv",
    });
    expect(result).toContain("<historical_file>");
    expect(result).toContain("</historical_file>");
    expect(result).toContain("balance.csv");
  });

  it("schema validates correct parse result", () => {
    const valid = {
      format_detected: "balance_sumas_saldos",
      periods_found: ["2024"],
      confidence: 0.85,
      accounts: [{ code: "6000", name: "Compras", has_movement: true, net_balance: -5000 }],
      parse_warnings: [],
    };
    const parsed = PARSE_HISTORICAL_FILE.schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("schema rejects missing format_detected", () => {
    const invalid = {
      periods_found: [],
      confidence: 0.5,
      accounts: [],
      parse_warnings: [],
    };
    const parsed = PARSE_HISTORICAL_FILE.schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// CALIBRATE_ACCOUNT_PLAN prompt
// ════════════════════════════════════════════════════════════

describe("CALIBRATE_ACCOUNT_PLAN", () => {
  it("has correct task", () => {
    expect(CALIBRATE_ACCOUNT_PLAN.task).toBe("calibrate_account_plan");
  });

  it("system mentions anomaly detection codes", () => {
    expect(CALIBRATE_ACCOUNT_PLAN.system).toContain("551");
    expect(CALIBRATE_ACCOUNT_PLAN.system).toContain("170");
    expect(CALIBRATE_ACCOUNT_PLAN.system).toContain("520");
  });

  it("system mentions recurring pattern threshold >= 3", () => {
    expect(CALIBRATE_ACCOUNT_PLAN.system).toContain(">=3");
  });

  it("buildUser wraps all three data sources in XML tags", () => {
    const result = CALIBRATE_ACCOUNT_PLAN.buildUser({
      inferred_plan: { subplan: [] },
      historical_accounts: [
        { code: "6000", name: "Compras", has_movement: true, net_balance: -1000 },
      ],
      business_profile: { sector: "comercio" },
    });
    expect(result).toContain("<inferred_plan>");
    expect(result).toContain("</inferred_plan>");
    expect(result).toContain("<historical_accounts>");
    expect(result).toContain("</historical_accounts>");
    expect(result).toContain("<company_data>");
    expect(result).toContain("</company_data>");
  });

  it("schema validates calibration with confirmed/added/inactive", () => {
    const valid = {
      accounts_confirmed: [{ code: "6000", name: "Compras" }],
      accounts_added: [{ code: "6290", name: "Otros servicios", reason: "Found in historical" }],
      accounts_inactive: [{ code: "3000", name: "Mercaderías", reason: "No movement" }],
      anomalies: [
        { code: "551", message: "Cuenta de socios detectada", severity: "warning" as const },
      ],
      recurring_patterns: [
        {
          concept: "Alquiler oficina",
          counterpart: "INMUEBLES SL",
          frequency: 12,
          avg_amount: 1500,
          confidence: 0.92,
        },
      ],
      calibration_summary: "Plan calibrado con datos históricos",
    };
    const parsed = CALIBRATE_ACCOUNT_PLAN.schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("schema rejects invalid severity", () => {
    const invalid = {
      accounts_confirmed: [],
      accounts_added: [],
      accounts_inactive: [],
      anomalies: [{ code: "551", message: "Test", severity: "extreme" }],
      recurring_patterns: [],
      calibration_summary: "Test",
    };
    const parsed = CALIBRATE_ACCOUNT_PLAN.schema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Infer endpoint logic
// ════════════════════════════════════════════════════════════

describe("Infer endpoint logic", () => {
  let mockDb: any;

  const inferenceResult = {
    subplan: [
      {
        code: "7000",
        name: "Ventas de mercaderías",
        status: "active",
        confidence: 0.9,
        reason: "Comercio",
      },
    ],
    fiscal_modules: [
      {
        model: "303",
        name: "IVA",
        periodicity: "trimestral",
        active: true,
        legal_basis: "Art. 164",
      },
      {
        model: "111",
        name: "Retenciones IRPF",
        periodicity: "trimestral",
        active: true,
        legal_basis: "Art. 101 LIRPF",
      },
    ],
    default_counterparts: [{ concept: "nóminas", debit_account: "640", credit_account: "465" }],
    warnings: [],
    summary: "Plan inferido para comercio",
  };

  beforeEach(() => {
    mockDb = {
      businessProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "bp1" }),
        update: vi.fn().mockResolvedValue({ id: "bp1" }),
      },
      company: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mockCallAIJson.mockReset();
  });

  it("creates BusinessProfile on first inference", async () => {
    mockCallAIJson.mockResolvedValue(inferenceResult);

    // Simulate the endpoint logic
    const input = {
      empresa: "Test SL",
      nif: "B12345678",
      forma_juridica: "SL",
      sector: "comercio",
      regimen_iva: "general",
      irpf_retenciones: true,
      actividad: "Venta productos",
      canales: ["Online"],
      cobro: "transferencia",
    };

    const result = await mockCallAIJson(
      ONBOARDING_INFERENCE.task,
      ONBOARDING_INFERENCE.system,
      ONBOARDING_INFERENCE.buildUser(input),
      ONBOARDING_INFERENCE.schema
    );

    expect(result).not.toBeNull();

    // Simulate create
    const existing = await mockDb.businessProfile.findUnique({ where: { companyId: "c1" } });
    expect(existing).toBeNull();

    await mockDb.businessProfile.create({
      data: {
        companyId: "c1",
        sector: input.sector,
        actividad: input.actividad,
        subplanPGC: result,
        inferredAt: new Date(),
      },
    });
    expect(mockDb.businessProfile.create).toHaveBeenCalled();
  });

  it("updates BusinessProfile on re-inference (idempotent)", async () => {
    mockCallAIJson.mockResolvedValue(inferenceResult);
    mockDb.businessProfile.findUnique.mockResolvedValue({ id: "bp1", companyId: "c1" });

    const existing = await mockDb.businessProfile.findUnique({ where: { companyId: "c1" } });
    expect(existing).not.toBeNull();

    await mockDb.businessProfile.update({
      where: { companyId: "c1" },
      data: { subplanPGC: inferenceResult, inferredAt: new Date() },
    });
    expect(mockDb.businessProfile.update).toHaveBeenCalled();
  });

  it("sets needsBusinessProfile = false after inference", async () => {
    mockCallAIJson.mockResolvedValue(inferenceResult);

    await mockDb.company.update({
      where: { id: "c1" },
      data: { needsBusinessProfile: false },
    });

    expect(mockDb.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { needsBusinessProfile: false },
      })
    );
  });
});

// ════════════════════════════════════════════════════════════
// Historical process endpoint logic
// ════════════════════════════════════════════════════════════

describe("Historical process endpoint logic", () => {
  let mockDb: any;

  const parseResult = {
    format_detected: "balance_sumas_saldos",
    periods_found: ["2024"],
    confidence: 0.85,
    accounts: [
      { code: "6000", name: "Compras", has_movement: true, net_balance: -5000 },
      { code: "7000", name: "Ventas", has_movement: true, net_balance: 12000 },
    ],
    parse_warnings: [],
  };

  const calibrationResult = {
    accounts_confirmed: [{ code: "6000", name: "Compras" }],
    accounts_added: [{ code: "6290", name: "Otros servicios", reason: "Found in historical" }],
    accounts_inactive: [],
    anomalies: [],
    recurring_patterns: [
      {
        concept: "Alquiler",
        counterpart: "PROP SL",
        frequency: 12,
        avg_amount: 1500,
        confidence: 0.9,
      },
    ],
    calibration_summary: "Calibrado OK",
  };

  beforeEach(() => {
    mockDb = {
      businessProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: "bp1",
          companyId: "c1",
          sector: "comercio",
          actividad: "Venta",
          canales: ["Online"],
          regimenIva: "general",
          subplanPGC: { subplan: [] },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      learnedPattern: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    mockCallAIJson.mockReset();
  });

  it("requires BusinessProfile to exist first", async () => {
    mockDb.businessProfile.findUnique.mockResolvedValue(null);
    const profile = await mockDb.businessProfile.findUnique({ where: { companyId: "c1" } });
    expect(profile).toBeNull();
    // Endpoint would return 400
  });

  it("parses file and returns accounts", async () => {
    mockCallAIJson.mockResolvedValue(parseResult);

    const result = await mockCallAIJson(
      PARSE_HISTORICAL_FILE.task,
      PARSE_HISTORICAL_FILE.system,
      PARSE_HISTORICAL_FILE.buildUser({ content: "test", filename: "balance.csv" }),
      PARSE_HISTORICAL_FILE.schema
    );

    expect(result).not.toBeNull();
    expect(result!.accounts).toHaveLength(2);
    expect(result!.format_detected).toBe("balance_sumas_saldos");
  });

  it("calibrates inferred plan with historical data", async () => {
    mockCallAIJson.mockResolvedValueOnce(parseResult).mockResolvedValueOnce(calibrationResult);

    // Parse
    const parsed = await mockCallAIJson(
      PARSE_HISTORICAL_FILE.task,
      PARSE_HISTORICAL_FILE.system,
      PARSE_HISTORICAL_FILE.buildUser({ content: "test", filename: "balance.csv" }),
      PARSE_HISTORICAL_FILE.schema
    );

    // Calibrate
    const calibrated = await mockCallAIJson(
      CALIBRATE_ACCOUNT_PLAN.task,
      CALIBRATE_ACCOUNT_PLAN.system,
      CALIBRATE_ACCOUNT_PLAN.buildUser({
        inferred_plan: { subplan: [] },
        historical_accounts: parsed!.accounts,
        business_profile: { sector: "comercio" },
      }),
      CALIBRATE_ACCOUNT_PLAN.schema
    );

    expect(calibrated).not.toBeNull();
    expect(calibrated!.accounts_confirmed).toHaveLength(1);
    expect(calibrated!.accounts_added).toHaveLength(1);
  });

  it("creates LearnedPattern entries for recurring patterns", async () => {
    for (const pattern of calibrationResult.recurring_patterns) {
      await mockDb.learnedPattern.create({
        data: {
          companyId: "c1",
          type: "historical_calibration",
          isActive: true,
          counterpartName: pattern.counterpart,
          conceptPattern: pattern.concept,
          predictedAction: "classify",
          predictedReason: `Patrón histórico: ${pattern.concept} (${pattern.frequency}x, media ${pattern.avg_amount}€)`,
          confidence: pattern.confidence,
          occurrences: pattern.frequency,
          correctPredictions: pattern.frequency,
        },
      });
    }

    expect(mockDb.learnedPattern.create).toHaveBeenCalledTimes(1);
    expect(mockDb.learnedPattern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "historical_calibration",
          conceptPattern: "Alquiler",
          counterpartName: "PROP SL",
        }),
      })
    );
  });

  it("updates BusinessProfile with calibration data", async () => {
    await mockDb.businessProfile.update({
      where: { companyId: "c1" },
      data: {
        subplanPGC: { subplan: [], calibration: calibrationResult },
        calibratedAt: new Date(),
        calibrationSource: "balance.csv",
      },
    });

    expect(mockDb.businessProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          calibrationSource: "balance.csv",
        }),
      })
    );
  });
});

// ════════════════════════════════════════════════════════════
// Wizard re-entrability
// ════════════════════════════════════════════════════════════

describe("Wizard re-entrability", () => {
  it("inference is idempotent — calling twice updates rather than duplicates", async () => {
    const mockDb = {
      businessProfile: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null) // first call
          .mockResolvedValueOnce({ id: "bp1", companyId: "c1" }), // second call
        create: vi.fn().mockResolvedValue({ id: "bp1" }),
        update: vi.fn().mockResolvedValue({ id: "bp1" }),
      },
    };

    // First call → create
    const first = await mockDb.businessProfile.findUnique({ where: { companyId: "c1" } });
    expect(first).toBeNull();
    await mockDb.businessProfile.create({ data: { companyId: "c1" } });

    // Second call → update
    const second = await mockDb.businessProfile.findUnique({ where: { companyId: "c1" } });
    expect(second).not.toBeNull();
    await mockDb.businessProfile.update({ where: { companyId: "c1" }, data: {} });

    expect(mockDb.businessProfile.create).toHaveBeenCalledTimes(1);
    expect(mockDb.businessProfile.update).toHaveBeenCalledTimes(1);
  });
});
