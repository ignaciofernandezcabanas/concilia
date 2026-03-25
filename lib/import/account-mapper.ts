/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ScopedPrisma } from "@/lib/db-scoped";
import type { ParsedAccount } from "./balance-parser";

export interface MappingResult {
  /** Account codes that matched an existing account exactly */
  existing: string[];
  /** Account codes that were auto-created by matching parent group */
  autoMapped: string[];
  /** Accounts that need manual review (no PGC match found) */
  needsReview: Array<{ code: string; name: string; suggestedGroup: string }>;
}

/**
 * Maps parsed balance accounts to PGC accounts in the database.
 *
 * 3 cases:
 * - Case 1 (~80%): subcuenta matches existing PGC account → existing
 * - Case 2 (~15%): parent code (first 3 digits) matches → auto-import with parent classification
 * - Case 3 (~5%): no match → needsReview
 */
export async function mapAccountsFromBalance(
  accounts: ParsedAccount[],
  db: ScopedPrisma
): Promise<MappingResult> {
  const existing: string[] = [];
  const autoMapped: string[] = [];
  const needsReview: Array<{
    code: string;
    name: string;
    suggestedGroup: string;
  }> = [];

  // Fetch all existing accounts for this company in one query
  const existingAccounts = await db.account.findMany({
    select: { code: true, group: true, parentCode: true },
  });
  const accountSet = new Map(existingAccounts.map((a: any) => [a.code, a]));

  for (const parsed of accounts) {
    // Case 1: exact match
    if (accountSet.has(parsed.code)) {
      existing.push(parsed.code);
      continue;
    }

    // Case 2: find parent by progressively shorter prefix (3-digit minimum)
    let parentAccount: any = null;
    const minLen = 3;
    for (let len = parsed.code.length - 1; len >= minLen; len--) {
      const prefix = parsed.code.slice(0, len);
      if (accountSet.has(prefix)) {
        parentAccount = accountSet.get(prefix);
        break;
      }
    }

    if (parentAccount) {
      // Auto-create the subcuenta inheriting parent classification
      await (db as any).account.create({
        data: {
          code: parsed.code,
          name: parsed.name,
          parentCode: parentAccount.code,
          group: parentAccount.group,
          isCustom: true,
          isActive: true,
        },
      });
      accountSet.set(parsed.code, {
        code: parsed.code,
        group: parentAccount.group,
        parentCode: parentAccount.code,
      });
      autoMapped.push(parsed.code);
      continue;
    }

    // Case 3: no match — suggest group based on first digit
    const firstDigit = parsed.code.charAt(0);
    const groupNames: Record<string, string> = {
      "1": "Financiación básica (Grupo 1)",
      "2": "Activo no corriente (Grupo 2)",
      "3": "Existencias (Grupo 3)",
      "4": "Acreedores y deudores (Grupo 4)",
      "5": "Cuentas financieras (Grupo 5)",
      "6": "Compras y gastos (Grupo 6)",
      "7": "Ventas e ingresos (Grupo 7)",
      "8": "Gastos imputados patrimonio (Grupo 8)",
      "9": "Ingresos imputados patrimonio (Grupo 9)",
    };

    needsReview.push({
      code: parsed.code,
      name: parsed.name,
      suggestedGroup: groupNames[firstDigit] ?? `Grupo ${firstDigit}`,
    });
  }

  return { existing, autoMapped, needsReview };
}
