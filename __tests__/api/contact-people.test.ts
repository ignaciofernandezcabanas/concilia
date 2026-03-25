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

import { GET, POST } from "@/app/api/contacts/[id]/people/route";
import { PUT, DELETE } from "@/app/api/contacts/[id]/people/[personId]/route";
import { POST as SET_DEFAULT } from "@/app/api/contacts/[id]/people/[personId]/set-default/route";

// ════════════════════════════════════════════════════════════
// GET /api/contacts/[id]/people
// ════════════════════════════════════════════════════════════

describe("GET /api/contacts/[id]/people", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns people for a contact", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findMany.mockResolvedValue([
      { id: "cp1", name: "John", email: "john@acme.com", isDefault: true },
      { id: "cp2", name: "Jane", email: "jane@acme.com", isDefault: false },
    ]);

    const req = new NextRequest("http://localhost/api/contacts/c1/people");
    const res = await GET(req, { params: { id: "c1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("John");
  });

  it("returns 404 when contact not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/nonexist/people");
    const res = await GET(req, { params: { id: "nonexist" } });
    expect(res.status).toBe(404);
  });

  it("returns 400 without id", async () => {
    const req = new NextRequest("http://localhost/api/contacts//people");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/contacts/[id]/people
// ════════════════════════════════════════════════════════════

describe("POST /api/contacts/[id]/people", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates first person with isDefault=true", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.count.mockResolvedValue(0);
    (mockCtx.db as any).contactPerson.create.mockResolvedValue({
      id: "cp1",
      name: "John",
      email: "john@acme.com",
      isDefault: true,
    });

    const req = new NextRequest("http://localhost/api/contacts/c1/people", {
      method: "POST",
      body: JSON.stringify({ name: "John", email: "john@acme.com" }),
    });
    const res = await POST(req, { params: { id: "c1" } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.name).toBe("John");
    expect((mockCtx.db as any).contactPerson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDefault: true }),
      })
    );
  });

  it("creates second person with isDefault=false", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.count.mockResolvedValue(1);
    (mockCtx.db as any).contactPerson.create.mockResolvedValue({
      id: "cp2",
      name: "Jane",
      email: "jane@acme.com",
      isDefault: false,
    });

    const req = new NextRequest("http://localhost/api/contacts/c1/people", {
      method: "POST",
      body: JSON.stringify({ name: "Jane", email: "jane@acme.com", role: "Administracion" }),
    });
    const res = await POST(req, { params: { id: "c1" } });

    expect(res.status).toBe(201);
    expect((mockCtx.db as any).contactPerson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDefault: false }),
      })
    );
  });

  it("rejects invalid email", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });

    const req = new NextRequest("http://localhost/api/contacts/c1/people", {
      method: "POST",
      body: JSON.stringify({ name: "John", email: "not-an-email" }),
    });
    const res = await POST(req, { params: { id: "c1" } });
    expect(res.status).toBe(400);
  });

  it("rejects missing name", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });

    const req = new NextRequest("http://localhost/api/contacts/c1/people", {
      method: "POST",
      body: JSON.stringify({ email: "john@acme.com" }),
    });
    const res = await POST(req, { params: { id: "c1" } });
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate email", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.count.mockResolvedValue(1);
    (mockCtx.db as any).contactPerson.create.mockRejectedValue({ code: "P2002" });

    const req = new NextRequest("http://localhost/api/contacts/c1/people", {
      method: "POST",
      body: JSON.stringify({ name: "John", email: "john@acme.com" }),
    });
    const res = await POST(req, { params: { id: "c1" } });
    expect(res.status).toBe(409);
  });

  it("returns 404 when contact not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/nonexist/people", {
      method: "POST",
      body: JSON.stringify({ name: "John", email: "john@acme.com" }),
    });
    const res = await POST(req, { params: { id: "nonexist" } });
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// PUT /api/contacts/[id]/people/[personId]
// ════════════════════════════════════════════════════════════

describe("PUT /api/contacts/[id]/people/[personId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates person fields", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue({
      id: "cp1",
      name: "John",
      email: "john@acme.com",
      contactId: "c1",
    });
    (mockCtx.db as any).contactPerson.update.mockResolvedValue({
      id: "cp1",
      name: "John Updated",
      email: "john@acme.com",
    });

    const req = new NextRequest("http://localhost/api/contacts/c1/people/cp1", {
      method: "PUT",
      body: JSON.stringify({ name: "John Updated", role: "Direccion" }),
    });
    const res = await PUT(req, { params: { id: "c1", personId: "cp1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("John Updated");
  });

  it("returns 404 when person not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/c1/people/nonexist", {
      method: "PUT",
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await PUT(req, { params: { id: "c1", personId: "nonexist" } });
    expect(res.status).toBe(404);
  });

  it("returns 400 without ids", async () => {
    const req = new NextRequest("http://localhost/api/contacts/c1/people/", {
      method: "PUT",
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await PUT(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue({
      id: "cp1",
      name: "John",
      contactId: "c1",
    });

    const req = new NextRequest("http://localhost/api/contacts/c1/people/cp1", {
      method: "PUT",
      body: JSON.stringify({ email: "bad-email" }),
    });
    const res = await PUT(req, { params: { id: "c1", personId: "cp1" } });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/contacts/[id]/people/[personId]
// ════════════════════════════════════════════════════════════

describe("DELETE /api/contacts/[id]/people/[personId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a non-default person", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue({
      id: "cp2",
      contactId: "c1",
      isDefault: false,
    });

    const req = new NextRequest("http://localhost/api/contacts/c1/people/cp2", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "c1", personId: "cp2" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect((mockCtx.db as any).contactPerson.delete).toHaveBeenCalledWith({
      where: { id: "cp2" },
    });
  });

  it("blocks deletion of only default person", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue({
      id: "cp1",
      contactId: "c1",
      isDefault: true,
    });
    (mockCtx.db as any).contactPerson.count.mockResolvedValue(1);

    const req = new NextRequest("http://localhost/api/contacts/c1/people/cp1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "c1", personId: "cp1" } });
    expect(res.status).toBe(409);
  });

  it("allows deletion of default person when others exist", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue({
      id: "cp1",
      contactId: "c1",
      isDefault: true,
    });
    (mockCtx.db as any).contactPerson.count.mockResolvedValue(2);

    const req = new NextRequest("http://localhost/api/contacts/c1/people/cp1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "c1", personId: "cp1" } });
    expect(res.status).toBe(200);
  });

  it("returns 404 when person not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/c1/people/nonexist", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "c1", personId: "nonexist" } });
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/contacts/[id]/people/[personId]/set-default
// ════════════════════════════════════════════════════════════

describe("POST /api/contacts/[id]/people/[personId]/set-default", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets a person as default, unsetting others", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue({
      id: "cp2",
      contactId: "c1",
      isDefault: false,
    });
    (mockCtx.db as any).contactPerson.updateMany.mockResolvedValue({ count: 1 });
    (mockCtx.db as any).contactPerson.update.mockResolvedValue({
      id: "cp2",
      isDefault: true,
    });

    const req = new NextRequest("http://localhost/api/contacts/c1/people/cp2/set-default", {
      method: "POST",
    });
    const res = await SET_DEFAULT(req, { params: { id: "c1", personId: "cp2" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isDefault).toBe(true);
    expect((mockCtx.db as any).contactPerson.updateMany).toHaveBeenCalledWith({
      where: { contactId: "c1", isDefault: true },
      data: { isDefault: false },
    });
    expect((mockCtx.db as any).contactPerson.update).toHaveBeenCalledWith({
      where: { id: "cp2" },
      data: { isDefault: true },
    });
  });

  it("returns 404 when person not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Acme SL" });
    (mockCtx.db as any).contactPerson.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/c1/people/nonexist/set-default", {
      method: "POST",
    });
    const res = await SET_DEFAULT(req, { params: { id: "c1", personId: "nonexist" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when contact not found", async () => {
    mockCtx.db.contact.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/contacts/nonexist/people/cp1/set-default", {
      method: "POST",
    });
    const res = await SET_DEFAULT(req, { params: { id: "nonexist", personId: "cp1" } });
    expect(res.status).toBe(404);
  });
});
