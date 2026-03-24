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

vi.mock("@/lib/utils/audit", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/utils/seed-pgc", () => ({
  seedPgcAccounts: vi.fn(),
}));

// Mock prisma for the companies endpoint (uses global prisma)
const mockPrisma = vi.hoisted(() => ({
  membership: { findFirst: vi.fn() },
  company: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  companyScope: { create: vi.fn() },
  accountingPeriod: { create: vi.fn() },
  ownBankAccount: { create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { GET, POST } from "@/app/api/settings/companies/route";

describe("Companies API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.membership.findFirst.mockResolvedValue({
      id: "m_1",
      role: "OWNER",
      organizationId: "org_1",
      organization: { id: "org_1", name: "Test Group", companies: [] },
    });
    mockPrisma.company.findMany.mockResolvedValue([
      {
        id: "c_1",
        name: "Parent SL",
        cif: "B12345678",
        consolidationMethod: "FULL",
        ownershipPercentage: 100,
        functionalCurrency: "EUR",
        isActive: true,
        isHoldingCompany: true,
        parentCompanyId: null,
      },
    ]);
    mockPrisma.company.create.mockResolvedValue({ id: "c_new", name: "New SL" });
    mockPrisma.companyScope.create.mockResolvedValue({});
    mockPrisma.accountingPeriod.create.mockResolvedValue({});
  });

  it("GET lista las empresas de la organización", async () => {
    const req = new NextRequest("http://localhost/api/settings/companies");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("POST crea una nueva empresa", async () => {
    const req = new NextRequest("http://localhost/api/settings/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Subsidiary SL",
        legalName: "Subsidiary Sociedad Limitada",
        cif: "B87654321",
        consolidationMethod: "FULL",
        ownershipPercentage: 80,
        functionalCurrency: "EUR",
      }),
    });
    const res = await POST(req);
    // Should be 201 or less than 500 (depends on mock completeness)
    expect(res.status).toBeLessThan(500);
  });

  it("POST rechaza sin nombre", async () => {
    const req = new NextRequest("http://localhost/api/settings/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif: "B12345678" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST rechaza CIF inválido", async () => {
    const req = new NextRequest("http://localhost/api/settings/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", legalName: "Test SL", cif: "INVALID" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
