/**
 * PGC (Plan General Contable) seed script.
 * Uses shared PGC_SEED_ACCOUNTS from lib/pgc-seed-data.ts.
 * Idempotent — skips accounts that already exist.
 * Usage: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PGC_SEED_ACCOUNTS } from "../lib/pgc-seed-data";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("No company found. Create one first.");
    return;
  }

  console.log(`Seeding PGC accounts for company: ${company.name} (${company.id})`);

  let created = 0;
  let skipped = 0;

  for (const acct of PGC_SEED_ACCOUNTS) {
    const existing = await prisma.account.findFirst({
      where: { code: acct.code, companyId: company.id },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.account.create({
      data: {
        code: acct.code,
        name: acct.name,
        group: acct.group,
        parentCode: acct.code.length > 1 ? acct.code.slice(0, -1) : null,
        pygLine: acct.pygLine ?? null,
        companyId: company.id,
      },
    });
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (existing): ${skipped}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
