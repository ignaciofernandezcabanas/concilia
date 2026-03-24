import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockCtx } from "../helpers/mock-auth";

const mockCtx = createMockCtx();

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: Request, routeCtx?: any) => handler(req, mockCtx, routeCtx);
  }),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

// Mock report generators to return minimal valid data
vi.mock("@/lib/reports/pyg-generator", () => ({
  generatePyG: vi.fn().mockResolvedValue({
    from: "2026-01-01",
    to: "2026-03-31",
    level: "titles",
    currency: "EUR",
    lines: [{ code: "1", label: "Ventas", amount: 10000 }],
    results: {
      resultadoExplotacion: 5000,
      resultadoFinanciero: 0,
      resultadoAntesImpuestos: 5000,
      resultadoEjercicio: 3750,
      ebitda: 6000,
    },
    generatedAt: new Date().toISOString(),
  }),
}));

vi.mock("@/lib/reports/balance-generator", () => ({
  generateBalance: vi.fn().mockResolvedValue({
    asOf: "2026-03-31",
    currency: "EUR",
    lines: [],
    totals: {
      activoNoCorriente: 0,
      activoCorriente: 50000,
      totalActivo: 50000,
      patrimonioNeto: 30000,
      pasivoNoCorriente: 0,
      pasivoCorriente: 20000,
      totalPasivo: 50000,
    },
    generatedAt: new Date().toISOString(),
  }),
}));

vi.mock("@/lib/reports/forecast-generator", () => ({
  generateForecast: vi.fn().mockResolvedValue({
    currentBalance: 50000,
    balanceDate: "2026-03-20",
    weeks: [
      {
        weekStart: "2026-03-23",
        weekEnd: "2026-03-29",
        expectedInflows: 5000,
        expectedOutflows: 3000,
        netFlow: 2000,
        projectedBalance: 52000,
        details: [],
      },
    ],
    totals: { totalExpectedInflows: 5000, totalExpectedOutflows: 3000, projectedEndBalance: 52000 },
    horizon: 12,
    generatedAt: new Date().toISOString(),
  }),
}));

describe("Report Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/reports/pyg devuelve PyG con líneas PGC", async () => {
    const { GET } = await import("@/app/api/reports/pyg/route");
    const req = new NextRequest("http://localhost/api/reports/pyg?from=2026-01-01&to=2026-03-31");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.lines).toBeDefined();
    expect(body.results).toBeDefined();
    expect(body.results.resultadoEjercicio).toBe(3750);
  });

  it("GET /api/reports/balance devuelve activo/pasivo/patrimonio", async () => {
    const { GET } = await import("@/app/api/reports/balance/route");
    const req = new NextRequest("http://localhost/api/reports/balance?asOf=2026-03-31");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totals).toBeDefined();
    expect(body.totals.totalActivo).toBe(50000);
    expect(body.totals.totalPasivo).toBe(50000);
  });

  it("GET /api/reports/forecast devuelve semanas con saldo proyectado", async () => {
    const { GET } = await import("@/app/api/reports/forecast/route");
    const req = new NextRequest("http://localhost/api/reports/forecast");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.weeks).toBeDefined();
    expect(body.currentBalance).toBe(50000);
  });

  it("GET /api/reports/dashboard devuelve KPIs", async () => {
    mockCtx.db.bankTransaction.count.mockResolvedValue(50);
    mockCtx.db.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 75000 } });
    mockCtx.db.reconciliation.count.mockResolvedValue(10);

    const { GET } = await import("@/app/api/reports/dashboard/route");
    const req = new NextRequest(
      "http://localhost/api/reports/dashboard?from=2026-03-01&to=2026-03-31"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
  });
});
