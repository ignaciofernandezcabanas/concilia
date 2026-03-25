/* eslint-disable @typescript-eslint/no-explicit-any */
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

// ════════════════════════════════════════════════════════════
// GET /api/contacts
// ════════════════════════════════════════════════════════════

import { GET, POST } from "@/app/api/contacts/route";

describe("GET /api/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.db.contact.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Acme SL",
        cif: "B12345678",
        type: "CUSTOMER",
        email: "info@acme.es",
        latePaymentRisk: null,
        _count: { invoices: 5 },
      },
      {
        id: "c2",
        name: "Provisa SA",
        cif: "A87654321",
        type: "SUPPLIER",
        email: "admin@provisa.es",
        latePaymentRisk: "low",
        _count: { invoices: 2 },
      },
    ]);
    mockCtx.db.contact.count.mockResolvedValue(2);
  });

  it("returns paginated contacts", async () => {
    const req = new NextRequest("http://localhost/api/contacts?page=1&pageSize=50");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(2);
  });

  it("filters by type", async () => {
    const req = new NextRequest("http://localhost/api/contacts?type=CUSTOMER");
    await GET(req);

    const call = mockCtx.db.contact.findMany.mock.calls[0][0];
    expect(call.where.type).toBe("CUSTOMER");
  });

  it("searches by name, cif, email", async () => {
    const req = new NextRequest("http://localhost/api/contacts?search=acme");
    await GET(req);

    const call = mockCtx.db.contact.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(3);
  });

  it("returns empty list when no contacts", async () => {
    mockCtx.db.contact.findMany.mockResolvedValue([]);
    mockCtx.db.contact.count.mockResolvedValue(0);

    const req = new NextRequest("http://localhost/api/contacts");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it("includes invoice count", async () => {
    const req = new NextRequest("http://localhost/api/contacts");
    await GET(req);

    const call = mockCtx.db.contact.findMany.mock.calls[0][0];
    expect(call.include._count.select.invoices).toBe(true);
  });

  it("orders by name ascending", async () => {
    const req = new NextRequest("http://localhost/api/contacts");
    await GET(req);

    const call = mockCtx.db.contact.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ name: "asc" });
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/contacts
// ════════════════════════════════════════════════════════════

describe("POST /api/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.db.contact.findFirst.mockResolvedValue(null);
    mockCtx.db.contact.create.mockResolvedValue({
      id: "c_new",
      name: "Nuevo SL",
      cif: "B99999999",
      type: "CUSTOMER",
    });
  });

  it("creates a contact with valid data", async () => {
    const req = new NextRequest("http://localhost/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: "Nuevo SL",
        cif: "B99999999",
        type: "CUSTOMER",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("c_new");
    expect(mockCtx.db.contact.create).toHaveBeenCalled();
  });

  it("rejects missing name", async () => {
    const req = new NextRequest("http://localhost/api/contacts", {
      method: "POST",
      body: JSON.stringify({ type: "CUSTOMER" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid type", async () => {
    const req = new NextRequest("http://localhost/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: "Test", type: "INVALID" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("prevents duplicate CIF", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "existing", cif: "B99999999" });

    const req = new NextRequest("http://localhost/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: "Dup SL", cif: "B99999999", type: "SUPPLIER" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("normalizes CIF (removes hyphens, uppercases)", async () => {
    const req = new NextRequest("http://localhost/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: "Test SL", cif: "b-123.456.78", type: "CUSTOMER" }),
    });
    await POST(req);

    const createCall = mockCtx.db.contact.create.mock.calls[0][0];
    expect(createCall.data.cif).toBe("B12345678");
  });

  it("allows null CIF", async () => {
    const req = new NextRequest("http://localhost/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: "Sin CIF SL", type: "BOTH" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
