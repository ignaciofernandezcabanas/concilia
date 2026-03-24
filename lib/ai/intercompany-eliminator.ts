/**
 * Intercompany Elimination Engine.
 *
 * Proposes elimination adjustments for consolidated reporting.
 * FULL consolidated: eliminate 100% of IC transactions.
 * PROPORTIONAL: eliminate ownership %.
 * EQUITY: no elimination (single line method).
 * NOT_CONSOLIDATED: excluded entirely.
 */

import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cross-company IC lookups

export interface EliminationProposal {
  companyA: { id: string; name: string };
  companyB: { id: string; name: string };
  accountCodeA: string;
  accountCodeB: string;
  amount: number;
  eliminationAmount: number;
  type: "REVENUE_EXPENSE" | "RECEIVABLE_PAYABLE" | "DIVIDEND" | "LOAN";
  confidence: number;
  reasoning: string;
}

export async function proposeEliminations(orgId: string): Promise<EliminationProposal[]> {
  // Get all confirmed IC links for the org
  const icLinks = await prisma.intercompanyLink.findMany({
    where: { organizationId: orgId, status: "CONFIRMED" },
  });

  if (icLinks.length === 0) return [];

  // Get all company consolidation configs in one query
  const companyIds = new Set<string>();
  for (const link of icLinks) {
    companyIds.add(link.companyAId);
    companyIds.add(link.companyBId);
  }

  const companies = await prisma.company.findMany({
    where: { id: { in: Array.from(companyIds) } },
    select: { id: true, name: true, consolidationMethod: true, ownershipPercentage: true },
  });

  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const proposals: EliminationProposal[] = [];

  for (const link of icLinks) {
    const companyA = companyMap.get(link.companyAId);
    const companyB = companyMap.get(link.companyBId);
    if (!companyA || !companyB) continue;

    // Skip if either company is NOT_CONSOLIDATED or EQUITY
    if (
      companyA.consolidationMethod === "NOT_CONSOLIDATED" ||
      companyB.consolidationMethod === "NOT_CONSOLIDATED" ||
      companyA.consolidationMethod === "EQUITY" ||
      companyB.consolidationMethod === "EQUITY"
    ) {
      continue;
    }

    const amount = Math.abs(link.amount);

    // Determine elimination percentage
    const pctA = (companyA.ownershipPercentage ?? 100) / 100;
    const pctB = (companyB.ownershipPercentage ?? 100) / 100;
    const eliminationPct = Math.min(pctA, pctB);
    const eliminationAmount = Math.round(amount * eliminationPct * 100) / 100;

    const isRevExp = link.amount > 0;
    const type: EliminationProposal["type"] = isRevExp ? "REVENUE_EXPENSE" : "RECEIVABLE_PAYABLE";
    const accountCodeA = isRevExp ? "700" : "430";
    const accountCodeB = isRevExp ? "600" : "400";

    proposals.push({
      companyA: { id: companyA.id, name: companyA.name },
      companyB: { id: companyB.id, name: companyB.name },
      accountCodeA,
      accountCodeB,
      amount,
      eliminationAmount,
      type,
      confidence: eliminationPct === 1 ? 0.95 : 0.8,
      reasoning: `Eliminación IC ${type}: ${companyA.name} ↔ ${companyB.name} por ${eliminationAmount.toFixed(2)} EUR (${Math.round(eliminationPct * 100)}%)`,
    });
  }

  return proposals;
}
