import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: cross-company sibling lookup
import type { BankTransaction } from "@prisma/client";

export interface IntercompanyResult {
  isIntercompany: boolean;
  siblingCompanyId: string | null;
  siblingCompanyName: string | null;
  organizationId: string | null;
  consolidationMethod: string | null;
  ownershipPercentage: number | null;
}

/**
 * Detects whether a bank transaction is an intercompany transfer —
 * i.e., the counterpart IBAN belongs to a sibling company within
 * the same organization.
 *
 * Respects consolidation method:
 * - NOT_CONSOLIDATED companies are excluded from IC detection
 * - Returns the consolidation method and ownership % for downstream use
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
    consolidationMethod: null,
    ownershipPercentage: null,
  };

  if (!tx.counterpartIban) return empty;

  // Get the company's organization and consolidation config
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true, consolidationMethod: true },
  });

  if (!company?.organizationId) return empty;

  // If THIS company is NOT_CONSOLIDATED, don't detect IC
  if (company.consolidationMethod === "NOT_CONSOLIDATED") return empty;

  const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();

  // Check if any sibling company owns this IBAN
  // Exclude NOT_CONSOLIDATED and inactive siblings
  const siblingAccount = await prisma.ownBankAccount.findFirst({
    where: {
      iban: normalizedIban,
      isActive: true,
      company: {
        organizationId: company.organizationId,
        id: { not: companyId },
        isActive: true,
        consolidationMethod: { not: "NOT_CONSOLIDATED" },
      },
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          consolidationMethod: true,
          ownershipPercentage: true,
        },
      },
    },
  });

  if (!siblingAccount) return empty;

  return {
    isIntercompany: true,
    siblingCompanyId: siblingAccount.company.id,
    siblingCompanyName: siblingAccount.company.name,
    organizationId: company.organizationId,
    consolidationMethod: siblingAccount.company.consolidationMethod,
    ownershipPercentage: siblingAccount.company.ownershipPercentage,
  };
}
