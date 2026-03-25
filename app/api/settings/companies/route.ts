import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createAuditLog } from "@/lib/utils/audit";
import { seedPgcAccounts } from "@/lib/utils/seed-pgc";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: creates company + cross-org queries
import { z } from "zod";

const createCompanySchema = z.object({
  name: z.string().min(1),
  shortName: z.string().optional(),
  legalName: z.string().min(1),
  cif: z.string().regex(/^[A-Z]\d{7,8}[A-Z0-9]?$|^\d{8}[A-Z]$/, "CIF/NIF inválido"),
  taxJurisdiction: z.string().length(2).default("ES"),
  localGaap: z.enum(["PGC_PYMES", "PGC_FULL", "IFRS", "US_GAAP", "OTHER"]).default("PGC_PYMES"),
  functionalCurrency: z.string().length(3).default("EUR"),
  presentationCurrency: z.string().length(3).optional(),
  parentCompanyId: z.string().optional().nullable(),
  consolidationMethod: z
    .enum(["FULL", "EQUITY", "PROPORTIONAL", "NOT_CONSOLIDATED"])
    .default("FULL"),
  ownershipPercentage: z.number().min(0).max(100).default(100),
  nciMethod: z.enum(["FAIR_VALUE", "PROPORTIONATE"]).optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  fiscalYearEndMonth: z.number().min(1).max(12).default(12),
  firstConsolidationPeriod: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  geographicRegion: z.string().optional().nullable(),
  bankAccounts: z
    .array(
      z.object({
        iban: z.string().min(1),
        bankName: z.string().optional(),
        alias: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * GET /api/settings/companies
 * List all companies in the user's active organization with hierarchy.
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: ctx.user.id },
      include: { organization: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No membership found" }, { status: 404 });
    }

    const companies = await prisma.company.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        parentCompany: { select: { id: true, name: true, shortName: true } },
        subsidiaries: { select: { id: true, name: true, shortName: true } },
        _count: { select: { bankTransactions: true, invoices: true, users: true } },
      },
      orderBy: [{ isHoldingCompany: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: companies });
  } catch (err) {
    return errorResponse("Failed to list companies", err);
  }
});

/**
 * POST /api/settings/companies
 * Create a new company in the user's organization.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const body = await req.json();
    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Get user's org
    const membership = await prisma.membership.findFirst({
      where: { userId: ctx.user.id, role: { in: ["OWNER", "ADMIN"] } },
      include: { organization: { include: { companies: true } } },
    });

    if (!membership) {
      return NextResponse.json({ error: "No OWNER/ADMIN membership" }, { status: 403 });
    }

    const org = membership.organization;
    const isFirstCompany = org.companies.length === 0;

    // Create company
    const company = await prisma.company.create({
      data: {
        name: data.name,
        shortName: data.shortName,
        legalName: data.legalName,
        cif: data.cif,
        currency: data.functionalCurrency,
        functionalCurrency: data.functionalCurrency,
        presentationCurrency: data.presentationCurrency,
        taxJurisdiction: data.taxJurisdiction,
        localGaap: data.localGaap,
        type: isFirstCompany ? "PARENT" : "SUBSIDIARY",
        isHoldingCompany: isFirstCompany,
        parentCompanyId: data.parentCompanyId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        consolidationMethod: data.consolidationMethod as any,
        ownershipPercentage: data.ownershipPercentage,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nciMethod: (data.nciMethod as any) ?? undefined,
        acquisitionDate: data.acquisitionDate ? new Date(data.acquisitionDate) : undefined,
        fiscalYearEndMonth: data.fiscalYearEndMonth,
        firstConsolidationPeriod: data.firstConsolidationPeriod,
        segment: data.segment,
        geographicRegion: data.geographicRegion,
        organizationId: org.id,
      },
    });

    // Create CompanyScope for current user
    await prisma.companyScope.create({
      data: {
        role: "ADMIN",
        membershipId: membership.id,
        companyId: company.id,
      },
    });

    // Seed PGC accounts
    await seedPgcAccounts(company.id);

    // Create accounting periods for current year
    const currentYear = new Date().getFullYear();
    for (let month = 1; month <= 12; month++) {
      await prisma.accountingPeriod.create({
        data: {
          year: currentYear,
          month,
          status: "OPEN",
          companyId: company.id,
        },
      });
    }

    // Create bank accounts if provided
    if (data.bankAccounts?.length) {
      for (const ba of data.bankAccounts) {
        await prisma.ownBankAccount.create({
          data: {
            iban: ba.iban,
            bankName: ba.bankName ?? "",
            alias: ba.alias ?? ba.iban.slice(-4),
            companyId: company.id,
          },
        });
      }
    }

    // Audit log
    await createAuditLog(ctx.db, {
      userId: ctx.user.id,
      action: "CREATE_COMPANY",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name, cif: company.cif, method: data.consolidationMethod },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create company", err);
  }
});
