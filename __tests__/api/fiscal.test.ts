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

import { GET } from "@/app/api/fiscal/route";

describe("GET /api/fiscal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.db.invoiceLine.findMany.mockResolvedValue([]);
  });

  it("requiere parámetros from y to", async () => {
    const req = new NextRequest("http://localhost/api/fiscal");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("devuelve datos de IVA con type=vat", async () => {
    const req = new NextRequest(
      "http://localhost/api/fiscal?type=vat&from=2026-01-01&to=2026-03-31"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("vat");
    expect(body).toHaveProperty("ivaRepercutido");
    expect(body).toHaveProperty("ivaSoportado");
    expect(body).toHaveProperty("liquidacion");
  });

  it("devuelve datos de retenciones con type=withholdings", async () => {
    const req = new NextRequest(
      "http://localhost/api/fiscal?type=withholdings&from=2026-01-01&to=2026-03-31"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("withholdings");
    expect(body).toHaveProperty("totals");
  });

  it("default type es vat", async () => {
    const req = new NextRequest("http://localhost/api/fiscal?from=2026-01-01&to=2026-03-31");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("vat");
  });
});
