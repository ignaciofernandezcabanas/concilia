import { prisma } from "@/lib/db";
import type { BankTransaction } from "@prisma/client";

export interface IntercompanyResult {
  isIntercompany: boolean;
  siblingCompanyId: string | null;
  siblingCompanyName: string | null;
  organizationId: string | null;
}

/**
 * Detects whether a bank transaction is an intercompany transfer —
 * i.e., the counterpart IBAN belongs to a sibling company within
 * the same organization.
 *
 * Only runs when the company belongs to an organization (has organizationId).
 */
export async function detectIntercompany(
  tx: BankTransaction,
  companyId: string
): Promise<IntercompanyResult> {
  const empty: IntercompanyResult = {
    isIntercompany: false,
    siblingCompanyId: null,
    siblingCompanyName: null,
    organizationId: null,
  };

  if (!tx.counterpartIban) return empty;

  // Get the company's organization
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });

  if (!company?.organizationId) return empty;

  const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();

  // Check if any sibling company owns this IBAN
  const siblingAccount = await prisma.ownBankAccount.findFirst({
    where: {
      iban: normalizedIban,
      isActive: true,
      company: {
        organizationId: company.organizationId,
        id: { not: companyId }, // exclude own company
      },
    },
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  if (!siblingAccount) return empty;

  return {
    isIntercompany: true,
    siblingCompanyId: siblingAccount.company.id,
    siblingCompanyName: siblingAccount.company.name,
    organizationId: company.organizationId,
  };
}
