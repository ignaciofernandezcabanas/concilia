/**
 * Syncs the chart of accounts from Holded into the local database.
 *
 * Maps Holded's account tree to a flat list and derives the PGC group
 * from the first digit of the account code.
 */

import { prisma } from "@/lib/db";
import { HoldedClient, type HoldedAccount } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncAccountsResult {
  created: number;
  updated: number;
  errors: Array<{ code: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function syncAccounts(
  companyId: string,
  apiKey: string,
): Promise<SyncAccountsResult> {
  const client = new HoldedClient(apiKey);
  const result: SyncAccountsResult = { created: 0, updated: 0, errors: [] };

  const rawAccounts = await client.getAccounts();
  const flatAccounts = flattenAccounts(rawAccounts);

  for (const account of flatAccounts) {
    try {
      const group = deriveGroup(account.accountNum);
      if (group === null) {
        // Skip accounts without a numeric code prefix
        continue;
      }

      const parentCode = deriveParentCode(account.accountNum);

      const existed = await prisma.account.findUnique({
        where: { code_companyId: { code: account.accountNum, companyId } },
        select: { id: true },
      });

      await prisma.account.upsert({
        where: {
          code_companyId: { code: account.accountNum, companyId },
        },
        create: {
          code: account.accountNum,
          name: account.name,
          group,
          parentCode,
          isActive: true,
          companyId,
        },
        update: {
          name: account.name,
          group,
          parentCode,
          isActive: true,
        },
      });

      if (existed) {
        result.updated++;
      } else {
        result.created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[syncAccounts] Error processing account ${account.accountNum}: ${message}`,
      );
      result.errors.push({ code: account.accountNum, error: message });
    }
  }

  await prisma.syncLog.create({
    data: {
      companyId,
      source: "holded",
      action: "sync-accounts",
      status: result.errors.length === 0 ? "success" : "partial",
      recordsProcessed: flatAccounts.length,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      completedAt: new Date(),
    },
  });

  console.log(
    `[syncAccounts] company=${companyId} created=${result.created} updated=${result.updated} errors=${result.errors.length}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flatten the Holded account tree into a simple list.
 * Holded returns accounts as a nested structure with `children` arrays.
 */
function flattenAccounts(accounts: HoldedAccount[]): HoldedAccount[] {
  const flat: HoldedAccount[] = [];

  function walk(items: HoldedAccount[]) {
    for (const item of items) {
      flat.push(item);
      if (item.children && item.children.length > 0) {
        walk(item.children);
      }
    }
  }

  walk(accounts);
  return flat;
}

/**
 * Derive PGC group from the first digit of the account code.
 * Spanish PGC groups: 1-9.
 */
function deriveGroup(code: string): number | null {
  const firstDigit = parseInt(code.charAt(0), 10);
  if (isNaN(firstDigit) || firstDigit < 1 || firstDigit > 9) return null;
  return firstDigit;
}

/**
 * Derive parent account code by removing the last digit.
 * e.g. "4300" → "430", "430" → "43", "4" → null
 */
function deriveParentCode(code: string): string | null {
  if (code.length <= 1) return null;
  return code.slice(0, -1);
}
