/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockCtx } from "../helpers/mock-auth";

const mockCtx = createMockCtx();

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: Request, routeCtx?: any) =>
      handler(req, { ...mockCtx, params: routeCtx?.params }, routeCtx);
  }),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/utils/audit", () => ({
  createAuditLog: vi.fn(),
}));

import { GET, PUT, DELETE } from "@/app/api/contacts/[id]/route";

// ════════════════════════════════════════════════════════════
// GET /api/contacts/[id]
// ════════════════════════════════════════════════════════════

describe("GET /api/contacts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns contact detail with invoices", async () => {
    mockCtx.db.contact.findUnique.mockResolvedValue({
      id: "c1",
      name: "Acme SL",
      cif: "B12345678",
      type: "CUSTOMER",
      invoices: [{ id: "inv1", number: "F-001", totalAmount: 1000, status: "PAID" }],
      _count: { invoices: 1, inquiries: 0, recurringAccruals: 0 },
    });

    const req = new NextRequest("http://localhost/api/contacts/c1");
    const res = await GET(req, { params: { id: "c1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Acme SL");
    expect(body.invoices).toHaveLength(1);
  });

  it("returns 404 for non-existent contact", async () => {
    mockCtx.db.contact.findUnique.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/nonexist");
    const res = await GET(req, { params: { id: "nonexist" } });
    expect(res.status).toBe(404);
  });

  it("returns 400 without id", async () => {
    const req = new NextRequest("http://localhost/api/contacts/");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// PUT /api/contacts/[id]
// ════════════════════════════════════════════════════════════

describe("PUT /api/contacts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.db.contact.findFirst.mockResolvedValue({
      id: "c1",
      name: "Acme SL",
      cif: "B12345678",
      type: "CUSTOMER",
    });
    mockCtx.db.contact.update.mockResolvedValue({
      id: "c1",
      name: "Acme Updated SL",
      cif: "B12345678",
      type: "CUSTOMER",
    });
  });

  it("updates contact successfully", async () => {
    const req = new NextRequest("http://localhost/api/contacts/c1", {
      method: "PUT",
      body: JSON.stringify({ name: "Acme Updated SL" }),
    });
    const res = await PUT(req, { params: { id: "c1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Acme Updated SL");
    expect(mockCtx.db.contact.update).toHaveBeenCalled();
  });

  it("returns 404 when contact not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/nonexist", {
      method: "PUT",
      body: JSON.stringify({ name: "Test" }),
    });
    const res = await PUT(req, { params: { id: "nonexist" } });
    expect(res.status).toBe(404);
  });

  it("rejects invalid email", async () => {
    const req = new NextRequest("http://localhost/api/contacts/c1", {
      method: "PUT",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await PUT(req, { params: { id: "c1" } });
    expect(res.status).toBe(400);
  });

  it("detects duplicate CIF on update", async () => {
    // findFirst for existence check returns existing contact
    mockCtx.db.contact.findFirst
      .mockResolvedValueOnce({ id: "c1", cif: "B12345678" }) // existing contact
      .mockResolvedValueOnce({ id: "c_other", cif: "A11111111" }); // duplicate check

    const req = new NextRequest("http://localhost/api/contacts/c1", {
      method: "PUT",
      body: JSON.stringify({ cif: "A11111111" }),
    });
    const res = await PUT(req, { params: { id: "c1" } });
    expect(res.status).toBe(409);
  });

  it("normalizes CIF on update", async () => {
    mockCtx.db.contact.findFirst
      .mockResolvedValueOnce({ id: "c1", cif: "B12345678" }) // existence check
      .mockResolvedValueOnce(null); // duplicate check — no duplicate

    const req = new NextRequest("http://localhost/api/contacts/c1", {
      method: "PUT",
      body: JSON.stringify({ cif: "b-999.888.77" }),
    });
    await PUT(req, { params: { id: "c1" } });

    const updateCall = mockCtx.db.contact.update.mock.calls[0][0];
    expect(updateCall.data.cif).toBe("B99988877");
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/contacts/[id]
// ════════════════════════════════════════════════════════════

describe("DELETE /api/contacts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes contact with no invoices", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({
      id: "c1",
      name: "Temp SL",
      _count: { invoices: 0 },
    });

    const req = new NextRequest("http://localhost/api/contacts/c1", { method: "DELETE" });
    const res = await DELETE(req, { params: { id: "c1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCtx.db.contact.delete).toHaveBeenCalled();
  });

  it("prevents deletion when invoices exist", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({
      id: "c1",
      name: "Important SL",
      _count: { invoices: 3 },
    });

    const req = new NextRequest("http://localhost/api/contacts/c1", { method: "DELETE" });
    const res = await DELETE(req, { params: { id: "c1" } });
    expect(res.status).toBe(409);
    expect(mockCtx.db.contact.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for non-existent contact", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/nonexist", { method: "DELETE" });
    const res = await DELETE(req, { params: { id: "nonexist" } });
    expect(res.status).toBe(404);
  });

  it("returns 400 without id", async () => {
    const req = new NextRequest("http://localhost/api/contacts/", { method: "DELETE" });
    const res = await DELETE(req, { params: {} });
    expect(res.status).toBe(400);
  });
});
