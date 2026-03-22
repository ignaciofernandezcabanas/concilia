import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { generatePyG } from "@/lib/reports/pyg-generator";
import { generateBalance } from "@/lib/reports/balance-generator";

/**
 * GET /api/reports/consolidated?report=pyg|balance&from=2026-01-01&to=2026-03-31
 *
 * Consolidated report across all companies in the user's active organization.
 * Only available for OWNER/ADMIN memberships.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const url = req.nextUrl;
    const report = url.searchParams.get("report") ?? "pyg";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Query parameters "from" and "to" are required.' },
        { status: 400 }
      );
    }

    // Get organization
    const company = await prisma.company.findUnique({
      where: { id: ctx.company.id },
      select: { organizationId: true },
    });

    if (!company?.organizationId) {
      return NextResponse.json(
        { error: "Esta empresa no pertenece a una organización." },
        { status: 400 }
      );
    }

    // Get all companies in the org
    const orgCompanies = await prisma.company.findMany({
      where: { organizationId: company.organizationId },
      select: { id: true, name: true, shortName: true },
    });

    if (report === "pyg") {
      const results = await Promise.all(
        orgCompanies.map(async (co) => {
          const pyg = await generatePyG(co.id, new Date(from), new Date(to));
          return { company: co, report: pyg };
        })
      );

      // Aggregate totals
      const consolidated: Record<string, number> = {};
      for (const r of results) {
        if (r.report && typeof r.report === "object" && "lines" in r.report) {
          const lines = r.report.lines as Array<{ code: string; amount: number }>;
          for (const line of lines) {
            consolidated[line.code] = (consolidated[line.code] ?? 0) + line.amount;
          }
        }
      }

      return NextResponse.json({
        type: "consolidated_pyg",
        organizationId: company.organizationId,
        period: { from, to },
        companies: results.map((r) => ({
          id: r.company.id,
          name: r.company.shortName ?? r.company.name,
        })),
        perCompany: results,
        consolidated,
      });
    }

    if (report === "balance") {
      const asOf = new Date(to);
      const results = await Promise.all(
        orgCompanies.map(async (co) => {
          const balance = await generateBalance(co.id, asOf);
          return { company: co, report: balance };
        })
      );

      return NextResponse.json({
        type: "consolidated_balance",
        organizationId: company.organizationId,
        asOf: to,
        companies: results.map((r) => ({
          id: r.company.id,
          name: r.company.shortName ?? r.company.name,
        })),
        perCompany: results,
      });
    }

    return NextResponse.json({ error: "Report type not supported. Use 'pyg' or 'balance'." }, { status: 400 });
  },
  "read:reports"
);
