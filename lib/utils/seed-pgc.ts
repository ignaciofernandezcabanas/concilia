/**
 * Shared PGC account seeder.
 * Creates default PGC (Plan General Contable) accounts for a company.
 * Used by onboarding and company management endpoints.
 */

import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: creates accounts for new company before scoped db exists

export async function seedPgcAccounts(companyId: string): Promise<void> {
  const { PGC_SEED_ACCOUNTS } = await import("@/lib/pgc-seed-data");
  for (const acc of PGC_SEED_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code_companyId: { code: acc.code, companyId } },
      create: {
        code: acc.code,
        name: acc.name,
        group: acc.group,
        parentCode: acc.code.length > 1 ? acc.code.slice(0, -1) : null,
        pygLine: acc.pygLine ?? null,
        companyId,
      },
      update: {},
    });
  }
}
