import { getScopedDb } from "@/lib/db-scoped";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generatePyG } from "@/lib/reports/pyg-generator";
import { generateBalance } from "@/lib/reports/balance-generator";
import { proposeEliminations } from "@/lib/ai/intercompany-eliminator";

/**
 * GET /api/reports/consolidated?report=pyg|balance&from=2026-01-01&to=2026-03-31
 *
 * Consolidated report across all companies in the user's active organization.
 * Applies consolidation method per company:
 *   FULL: 100% of lines + NCI row for minority interest
 *   EQUITY: single line = ownership% × resultado
 *   PROPORTIONAL: each line × ownership%
 *   NOT_CONSOLIDATED: excluded
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
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

  const company = await db.company.findUnique({
    where: { id: ctx.company.id },
    select: { organizationId: true },
  });

  if (!company?.organizationId) {
    return NextResponse.json(
      { error: "Esta empresa no pertenece a una organización." },
      { status: 400 }
    );
  }

  // Get all active companies with consolidation config
  const orgCompanies = await db.company.findMany({
    where: { organizationId: company.organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      shortName: true,
      consolidationMethod: true,
      ownershipPercentage: true,
    },
  });

  if (report === "pyg") {
    const results = await Promise.all(
      orgCompanies
        .filter((co) => co.consolidationMethod !== "NOT_CONSOLIDATED")
        .map(async (co) => {
          const pyg = await generatePyG(getScopedDb(co.id), new Date(from), new Date(to));
          return { company: co, report: pyg };
        })
    );

    // Aggregate by consolidation method
    const consolidated: Record<string, number> = {};
    let nciTotal = 0;

    for (const r of results) {
      if (!r.report || typeof r.report !== "object" || !("lines" in r.report)) continue;

      const lines = r.report.lines as Array<{ code: string; amount: number }>;
      const method = r.company.consolidationMethod;
      const pct = (r.company.ownershipPercentage ?? 100) / 100;

      if (method === "FULL") {
        // Include 100% of lines
        for (const line of lines) {
          consolidated[line.code] = (consolidated[line.code] ?? 0) + line.amount;
        }
        // Calculate NCI if <100% ownership
        if (pct < 1) {
          const resultado = (r.report as any).results?.resultadoEjercicio ?? 0;
          nciTotal += (1 - pct) * resultado;
        }
      } else if (method === "EQUITY") {
        // Single line: ownership% × resultado
        const resultado = (r.report as any).results?.resultadoEjercicio ?? 0;
        const equityAmount = pct * resultado;
        // Add to financial income line (line 12 in PGC)
        consolidated["12"] = (consolidated["12"] ?? 0) + equityAmount;
      } else if (method === "PROPORTIONAL") {
        // Each line × ownership%
        for (const line of lines) {
          consolidated[line.code] = (consolidated[line.code] ?? 0) + line.amount * pct;
        }
      }
    }

    // Apply intercompany eliminations
    const eliminations = await proposeEliminations(company.organizationId!);
    const eliminationsByLine: Record<string, number> = {};
    for (const elim of eliminations) {
      // Eliminate revenue (line mapped from accountCodeA) and expense (line mapped from accountCodeB)
      // Simplified: reduce both sides proportionally
      if (elim.type === "REVENUE_EXPENSE") {
        eliminationsByLine["1"] = (eliminationsByLine["1"] ?? 0) - elim.eliminationAmount; // reduce revenue
        eliminationsByLine["4"] = (eliminationsByLine["4"] ?? 0) + elim.eliminationAmount; // reduce expense (add back)
      }
    }

    // Apply eliminations to consolidated
    const consolidatedAfterElim = { ...consolidated };
    for (const [line, adj] of Object.entries(eliminationsByLine)) {
      consolidatedAfterElim[line] = (consolidatedAfterElim[line] ?? 0) + adj;
    }

    return NextResponse.json({
      type: "consolidated_pyg",
      organizationId: company.organizationId,
      period: { from, to },
      companies: orgCompanies.map((co) => ({
        id: co.id,
        name: co.shortName ?? co.name,
        method: co.consolidationMethod,
        ownership: co.ownershipPercentage,
      })),
      perCompany: results,
      consolidated: consolidatedAfterElim,
      eliminations: eliminationsByLine,
      eliminationDetails: eliminations,
      nci: nciTotal !== 0 ? Math.round(nciTotal * 100) / 100 : null,
    });
  }

  if (report === "balance") {
    const asOf = new Date(to);
    const results = await Promise.all(
      orgCompanies
        .filter((co) => co.consolidationMethod !== "NOT_CONSOLIDATED")
        .map(async (co) => {
          const balance = await generateBalance(getScopedDb(co.id), asOf);
          return { company: co, report: balance };
        })
    );

    return NextResponse.json({
      type: "consolidated_balance",
      organizationId: company.organizationId,
      asOf: to,
      companies: orgCompanies.map((co) => ({
        id: co.id,
        name: co.shortName ?? co.name,
        method: co.consolidationMethod,
        ownership: co.ownershipPercentage,
      })),
      perCompany: results,
    });
  }

  return NextResponse.json(
    { error: "Report type not supported. Use 'pyg' or 'balance'." },
    { status: 400 }
  );
}, "read:reports");
