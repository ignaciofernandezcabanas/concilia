/**
 * Close Proposal Generator.
 *
 * Generates a monthly close proposal using Opus.
 * Gathers: pending journal entries, unconfirmed interco, estimated result.
 */

import { prisma } from "@/lib/db";
import { callAI } from "@/lib/ai/model-router";
import { CLOSE_PROPOSAL } from "@/lib/ai/prompt-registry";

export async function generateCloseProposal(
  orgId: string,
  orgName: string,
  month: string
): Promise<string | null> {
  const companies = await prisma.company.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, shortName: true },
  });

  const companyIds = companies.map((c) => c.id);

  // Pending journal entries
  const pendingEntries = await prisma.journalEntry.count({
    where: {
      companyId: { in: companyIds },
      status: "DRAFT",
    },
  });

  // Unconfirmed intercompany links
  const pendingInterco = await prisma.intercompanyLink.count({
    where: {
      organizationId: orgId,
      status: "DETECTED",
    },
  });

  // Open accounting periods
  const [yearStr, monthStr] = month.split("-");
  const openPeriods = await prisma.accountingPeriod.findMany({
    where: {
      companyId: { in: companyIds },
      year: parseInt(yearStr),
      month: parseInt(monthStr),
      status: "OPEN",
    },
    include: { company: { select: { shortName: true, name: true } } },
  });

  const openCompanies = openPeriods.map(
    (p) => p.company.shortName ?? p.company.name
  );

  // Pending bank transactions
  const pendingTxCount = await prisma.bankTransaction.count({
    where: {
      companyId: { in: companyIds },
      status: "PENDING",
    },
  });

  const checklistJson = JSON.stringify({
    companies: companies.map((c) => c.shortName ?? c.name),
    companiesNotClosed: openCompanies,
    pendingJournalEntries: pendingEntries,
    pendingIntercompany: pendingInterco,
    pendingBankTransactions: pendingTxCount,
    month,
  });

  return callAI(
    "close_proposal",
    CLOSE_PROPOSAL.system,
    CLOSE_PROPOSAL.buildUser({ orgName, month, checklistJson })
  );
}
