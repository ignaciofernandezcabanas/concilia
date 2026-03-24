import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockCtx } from "../helpers/mock-auth";

// Mock withAuth to pass through with mock ctx
const mockCtx = createMockCtx();

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: Request, routeCtx?: any) => handler(req, mockCtx, routeCtx);
  }),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/utils/audit", () => ({
  createAuditLog: vi.fn(),
}));

import { GET } from "@/app/api/transactions/route";

describe("GET /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.db.bankTransaction.findMany.mockResolvedValue([
      {
        id: "tx_1",
        amount: -1200,
        concept: "PAGO PROVEEDOR",
        status: "PENDING",
        valueDate: new Date(),
      },
      {
        id: "tx_2",
        amount: 5000,
        concept: "COBRO CLIENTE",
        status: "RECONCILED",
        valueDate: new Date(),
      },
    ]);
    mockCtx.db.bankTransaction.count.mockResolvedValue(2);
  });

  it("devuelve respuesta paginada", async () => {
    const req = new NextRequest("http://localhost/api/transactions?page=1&pageSize=20");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toBeDefined();
  });

  it("filtra por status", async () => {
    const req = new NextRequest("http://localhost/api/transactions?status=PENDING");
    await GET(req);

    expect(mockCtx.db.bankTransaction.findMany).toHaveBeenCalled();
  });

  it("devuelve 200 con lista vacía si no hay transacciones", async () => {
    mockCtx.db.bankTransaction.findMany.mockResolvedValue([]);
    mockCtx.db.bankTransaction.count.mockResolvedValue(0);

    const req = new NextRequest("http://localhost/api/transactions");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
