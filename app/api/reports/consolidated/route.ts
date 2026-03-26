/* eslint-disable @typescript-eslint/no-explicit-any */
import { getScopedDb } from "@/lib/db-scoped";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cross-company lookup for consolidated reports
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generatePyG } from "@/lib/reports/pyg-generator";
import { generateBalance } from "@/lib/reports/balance-generator";
import { generateCashflow } from "@/lib/reports/cashflow-generator";
import { proposeEliminations } from "@/lib/ai/intercompany-eliminator";

/**
 * GET /api/reports/consolidated?report=pyg|balance|efe&from=2026-01-01&to=2026-03-31
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

  // Get all active companies in the org (needs global prisma — scoped DB would only return current company)
  const orgCompanies = await prisma.company.findMany({
    where: { organizationId: company.organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      shortName: true,
      consolidationMethod: true,
      ownershipPercentage: true,
    },
  });

  const companiesMeta = orgCompanies.map((co) => ({
    id: co.id,
    name: co.shortName ?? co.name,
    method: co.consolidationMethod,
    ownership: co.ownershipPercentage,
  }));

  const consolidatable = orgCompanies.filter((co) => co.consolidationMethod !== "NOT_CONSOLIDATED");

  // ── PyG ──
  if (report === "pyg") {
    const results = await Promise.all(
      consolidatable.map(async (co) => {
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
        for (const line of lines) {
          consolidated[line.code] = (consolidated[line.code] ?? 0) + line.amount;
        }
        if (pct < 1) {
          const resultado = (r.report as any).results?.resultadoEjercicio ?? 0;
          nciTotal += (1 - pct) * resultado;
        }
      } else if (method === "EQUITY") {
        const resultado = (r.report as any).results?.resultadoEjercicio ?? 0;
        consolidated["12"] = (consolidated["12"] ?? 0) + pct * resultado;
      } else if (method === "PROPORTIONAL") {
        for (const line of lines) {
          consolidated[line.code] = (consolidated[line.code] ?? 0) + line.amount * pct;
        }
      }
    }

    // Intercompany eliminations
    const eliminations = await proposeEliminations(company.organizationId!);
    const eliminationsByLine: Record<string, number> = {};
    for (const elim of eliminations) {
      if (elim.type === "REVENUE_EXPENSE") {
        eliminationsByLine["1"] = (eliminationsByLine["1"] ?? 0) - elim.eliminationAmount;
        eliminationsByLine["4"] = (eliminationsByLine["4"] ?? 0) + elim.eliminationAmount;
      }
    }

    const consolidatedAfterElim = { ...consolidated };
    for (const [line, adj] of Object.entries(eliminationsByLine)) {
      consolidatedAfterElim[line] = (consolidatedAfterElim[line] ?? 0) + adj;
    }

    return NextResponse.json({
      type: "consolidated_pyg",
      organizationId: company.organizationId,
      period: { from, to },
      companies: companiesMeta,
      perCompany: results,
      consolidated: consolidatedAfterElim,
      eliminations: eliminationsByLine,
      eliminationDetails: eliminations,
      nci: nciTotal !== 0 ? Math.round(nciTotal * 100) / 100 : null,
    });
  }

  // ── Balance ──
  if (report === "balance") {
    const asOf = new Date(to);
    const results = await Promise.all(
      consolidatable.map(async (co) => {
        const balance = await generateBalance(getScopedDb(co.id), asOf);
        return { company: co, report: balance };
      })
    );

    // Aggregate balance lines
    const consolidated: Record<string, number> = {};
    for (const r of results) {
      if (!r.report || !("lines" in r.report)) continue;
      const lines = r.report.lines as Array<{ code: string; amount: number }>;
      const method = r.company.consolidationMethod;
      const pct = (r.company.ownershipPercentage ?? 100) / 100;
      const factor = method === "PROPORTIONAL" ? pct : 1;
      for (const line of lines) {
        consolidated[line.code] = (consolidated[line.code] ?? 0) + line.amount * factor;
      }
    }

    return NextResponse.json({
      type: "consolidated_balance",
      organizationId: company.organizationId,
      asOf: to,
      companies: companiesMeta,
      perCompany: results,
      consolidated,
    });
  }

  // ── EFE (indirect cash flow) ──
  if (report === "efe") {
    const results = await Promise.all(
      consolidatable.map(async (co) => {
        const efe = await generateCashflow(
          getScopedDb(co.id),
          new Date(from),
          new Date(to),
          "indirect"
        );
        return { company: co, report: efe };
      })
    );

    // Aggregate EFE sections by code
    const consolidated: Record<string, number> = {};
    for (const r of results) {
      if (!r.report || !("sections" in r.report)) continue;
      const sections = (r.report as any).sections as Array<{
        code: string;
        amount: number;
        children?: Array<{ label: string; amount: number }>;
      }>;
      const method = r.company.consolidationMethod;
      const pct = (r.company.ownershipPercentage ?? 100) / 100;
      const factor = method === "PROPORTIONAL" ? pct : 1;

      for (const section of sections) {
        consolidated[section.code] = (consolidated[section.code] ?? 0) + section.amount * factor;
        // Also aggregate children by matching label → code mapping
        if (section.children) {
          for (const child of section.children) {
            const childKey = `${section.code}.${child.label.substring(0, 2).trim()}`;
            consolidated[childKey] = (consolidated[childKey] ?? 0) + child.amount * factor;
          }
        }
      }
    }

    return NextResponse.json({
      type: "consolidated_efe",
      organizationId: company.organizationId,
      period: { from, to },
      companies: companiesMeta,
      perCompany: results,
      consolidated,
    });
  }

  return NextResponse.json(
    { error: "Report type not supported. Use 'pyg', 'balance' or 'efe'." },
    { status: 400 }
  );
}, "read:reports");
