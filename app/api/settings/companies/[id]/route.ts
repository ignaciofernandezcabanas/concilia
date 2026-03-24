import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createAuditLog } from "@/lib/utils/audit";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cross-company lookups
import { z } from "zod";

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  shortName: z.string().optional().nullable(),
  legalName: z.string().optional().nullable(),
  cif: z.string().optional(),
  taxJurisdiction: z.string().length(2).optional(),
  localGaap: z.string().optional(),
  functionalCurrency: z.string().length(3).optional(),
  presentationCurrency: z.string().length(3).optional().nullable(),
  parentCompanyId: z.string().optional().nullable(),
  consolidationMethod: z.enum(["FULL", "EQUITY", "PROPORTIONAL", "NOT_CONSOLIDATED"]).optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
  nciMethod: z.enum(["FAIR_VALUE", "PROPORTIONATE"]).optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  fiscalYearEndMonth: z.number().min(1).max(12).optional(),
  firstConsolidationPeriod: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  geographicRegion: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  deactivationReason: z.string().optional().nullable(),
});

/**
 * GET /api/settings/companies/[id]
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const company = await prisma.company.findUnique({
        where: { id },
        include: {
          parentCompany: { select: { id: true, name: true, shortName: true } },
          subsidiaries: {
            select: {
              id: true,
              name: true,
              shortName: true,
              consolidationMethod: true,
              ownershipPercentage: true,
            },
          },
          _count: {
            select: { bankTransactions: true, invoices: true, users: true, journalEntries: true },
          },
        },
      });

      if (!company) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }

      return NextResponse.json(company);
    } catch (err) {
      return errorResponse("Failed to get company", err);
    }
  }
);

/**
 * PUT /api/settings/companies/[id]
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const body = await req.json();
      const parsed = updateCompanySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const data = parsed.data;

      // Build update object
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.shortName !== undefined) update.shortName = data.shortName;
      if (data.legalName !== undefined) update.legalName = data.legalName;
      if (data.cif !== undefined) update.cif = data.cif;
      if (data.taxJurisdiction !== undefined) update.taxJurisdiction = data.taxJurisdiction;
      if (data.localGaap !== undefined) update.localGaap = data.localGaap;
      if (data.functionalCurrency !== undefined) {
        update.functionalCurrency = data.functionalCurrency;
        update.currency = data.functionalCurrency;
      }
      if (data.presentationCurrency !== undefined)
        update.presentationCurrency = data.presentationCurrency;
      if (data.parentCompanyId !== undefined) update.parentCompanyId = data.parentCompanyId;
      if (data.consolidationMethod !== undefined)
        update.consolidationMethod = data.consolidationMethod;
      if (data.ownershipPercentage !== undefined)
        update.ownershipPercentage = data.ownershipPercentage;
      if (data.nciMethod !== undefined) update.nciMethod = data.nciMethod;
      if (data.acquisitionDate !== undefined) {
        update.acquisitionDate = data.acquisitionDate ? new Date(data.acquisitionDate) : null;
      }
      if (data.fiscalYearEndMonth !== undefined)
        update.fiscalYearEndMonth = data.fiscalYearEndMonth;
      if (data.firstConsolidationPeriod !== undefined)
        update.firstConsolidationPeriod = data.firstConsolidationPeriod;
      if (data.segment !== undefined) update.segment = data.segment;
      if (data.geographicRegion !== undefined) update.geographicRegion = data.geographicRegion;

      // Soft delete
      if (data.isActive === false) {
        update.isActive = false;
        update.deactivationDate = new Date();
        update.deactivationReason = data.deactivationReason ?? null;
      } else if (data.isActive === true) {
        update.isActive = true;
        update.deactivationDate = null;
        update.deactivationReason = null;
      }

      const company = await prisma.company.update({
        where: { id },
        data: update,
      });

      await createAuditLog(ctx.db, {
        userId: ctx.user.id,
        action: "UPDATE_COMPANY",
        entityType: "company",
        entityId: company.id,
        details: { fields: Object.keys(update) },
      });

      return NextResponse.json(company);
    } catch (err) {
      return errorResponse("Failed to update company", err);
    }
  }
);
