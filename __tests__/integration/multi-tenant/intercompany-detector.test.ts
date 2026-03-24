import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBankTransaction } from "../../helpers/factories";

const mockPrisma = vi.hoisted(() => ({
  company: { findUnique: vi.fn() },
  ownBankAccount: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { detectIntercompany } from "@/lib/reconciliation/detectors/intercompany-detector";

describe("detectIntercompany", () => {
  beforeEach(() => vi.clearAllMocks());

  it("detects intercompany when IBAN belongs to sibling company", async () => {
    mockPrisma.company.findUnique.mockResolvedValue({ organizationId: "org_1" });
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue({
      id: "ba_sibling",
      iban: "ES7620770024003102575766",
      company: { id: "company_2", name: "Sibling S.L." },
    });

    const tx = buildBankTransaction({ counterpartIban: "ES7620770024003102575766" });
    const result = await detectIntercompany(tx, "company_1");

    expect(result.isIntercompany).toBe(true);
    expect(result.siblingCompanyId).toBe("company_2");
    expect(result.siblingCompanyName).toBe("Sibling S.L.");
    expect(result.organizationId).toBe("org_1");
  });

  it("returns false when company has no organization", async () => {
    mockPrisma.company.findUnique.mockResolvedValue({ organizationId: null });

    const tx = buildBankTransaction();
    const result = await detectIntercompany(tx, "company_1");

    expect(result.isIntercompany).toBe(false);
    expect(mockPrisma.ownBankAccount.findFirst).not.toHaveBeenCalled();
  });

  it("returns false when no counterpart IBAN", async () => {
    const tx = buildBankTransaction({ counterpartIban: null });
    const result = await detectIntercompany(tx, "company_1");

    expect(result.isIntercompany).toBe(false);
    expect(mockPrisma.company.findUnique).not.toHaveBeenCalled();
  });

  it("returns false when IBAN does not belong to any sibling", async () => {
    mockPrisma.company.findUnique.mockResolvedValue({ organizationId: "org_1" });
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue(null);

    const tx = buildBankTransaction();
    const result = await detectIntercompany(tx, "company_1");

    expect(result.isIntercompany).toBe(false);
    expect(result.siblingCompanyId).toBeNull();
  });

  it("normalizes IBAN with spaces before lookup", async () => {
    mockPrisma.company.findUnique.mockResolvedValue({ organizationId: "org_1" });
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue(null);

    const tx = buildBankTransaction({ counterpartIban: "ES76 2077 0024 0031 0257 5766" });
    await detectIntercompany(tx, "company_1");

    expect(mockPrisma.ownBankAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          iban: "ES7620770024003102575766",
        }),
      })
    );
  });

  it("excludes own company from sibling search", async () => {
    mockPrisma.company.findUnique.mockResolvedValue({ organizationId: "org_1" });
    mockPrisma.ownBankAccount.findFirst.mockResolvedValue(null);

    const tx = buildBankTransaction();
    await detectIntercompany(tx, "company_1");

    expect(mockPrisma.ownBankAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          company: expect.objectContaining({
            id: { not: "company_1" },
            organizationId: "org_1",
          }),
        }),
      })
    );
  });
});
