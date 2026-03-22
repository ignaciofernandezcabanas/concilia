import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";

/**
 * GET /api/intercompany?status=DETECTED&page=1&limit=20
 *
 * Lists intercompany links for the user's active organization.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const { company } = ctx;

    if (!company.organizationId) {
      return NextResponse.json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    }

    const url = req.nextUrl;
    const status = url.searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where = {
      organizationId: company.organizationId,
      ...(status ? { status: status as "DETECTED" | "CONFIRMED" | "ELIMINATED" } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.intercompanyLink.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.intercompanyLink.count({ where }),
    ]);

    // Enrich with company names
    const companyIds = new Set<string>();
    data.forEach((d) => {
      companyIds.add(d.companyAId);
      companyIds.add(d.companyBId);
    });

    const companies = await prisma.company.findMany({
      where: { id: { in: Array.from(companyIds) } },
      select: { id: true, name: true, shortName: true },
    });
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));

    const enriched = data.map((d) => ({
      ...d,
      companyA: companyMap[d.companyAId] ?? null,
      companyB: companyMap[d.companyBId] ?? null,
    }));

    return NextResponse.json({
      data: enriched,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
  "read:dashboard"
);
