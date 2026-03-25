/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ScopedPrisma } from "@/lib/db-scoped";
import type { ParsedAccount } from "./balance-parser";

interface OpeningBalanceResult {
  journalEntryId: string | null;
  warnings: string[];
}

/**
 * Generate an opening journal entry (asiento de apertura) from parsed balance accounts.
 *
 * - Verifies balance squares (total debit ~ total credit, gap < 1 EUR)
 * - Each account with positive net balance → debit line
 * - Each account with negative net balance → credit line
 * - Creates JE as DRAFT
 * - Checks for duplicates (same period date)
 */
export async function generateOpeningBalance(
  accounts: ParsedAccount[],
  periodDate: Date,
  db: ScopedPrisma
): Promise<OpeningBalanceResult> {
  const warnings: string[] = [];

  if (accounts.length === 0) {
    return {
      journalEntryId: null,
      warnings: ["No hay cuentas para generar el asiento de apertura"],
    };
  }

  // Calculate total debits and credits from net balances
  let totalDebit = 0;
  let totalCredit = 0;

  for (const acc of accounts) {
    if (acc.netBalance > 0) {
      totalDebit += acc.netBalance;
    } else if (acc.netBalance < 0) {
      totalCredit += Math.abs(acc.netBalance);
    }
  }

  const gap = Math.abs(totalDebit - totalCredit);
  if (gap >= 1) {
    warnings.push(
      `El balance no cuadra: debe=${totalDebit.toFixed(2)}, haber=${totalCredit.toFixed(2)}, ` +
        `diferencia=${gap.toFixed(2)} EUR. No se genera asiento.`
    );
    return { journalEntryId: null, warnings };
  }

  // Check for duplicate opening balance on the same date
  const existingJE = await db.journalEntry.findFirst({
    where: {
      type: "OPENING",
      date: periodDate,
    },
  });

  if (existingJE) {
    warnings.push(
      `Ya existe un asiento de apertura para la fecha ${periodDate.toISOString().slice(0, 10)} (ID: ${existingJE.id})`
    );
    return { journalEntryId: null, warnings };
  }

  // Resolve account codes to IDs
  const accountCodes = accounts.filter((a) => a.netBalance !== 0).map((a) => a.code);

  const dbAccounts = await db.account.findMany({
    where: { code: { in: accountCodes } },
    select: { id: true, code: true },
  });

  const codeToId = new Map(dbAccounts.map((a: any) => [a.code, a.id]));

  // Check for missing accounts
  const missingCodes = accountCodes.filter((c) => !codeToId.has(c));
  if (missingCodes.length > 0) {
    warnings.push(
      `Cuentas no encontradas en el plan contable: ${missingCodes.join(", ")}. Se omiten del asiento.`
    );
  }

  // Build journal entry lines
  const lines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    description: string;
  }> = [];

  for (const acc of accounts) {
    if (acc.netBalance === 0) continue;
    const accountId = codeToId.get(acc.code);
    if (!accountId) continue;

    if (acc.netBalance > 0) {
      lines.push({
        accountId,
        debit: Math.round(acc.netBalance * 100) / 100,
        credit: 0,
        description: acc.name,
      });
    } else {
      lines.push({
        accountId,
        debit: 0,
        credit: Math.round(Math.abs(acc.netBalance) * 100) / 100,
        description: acc.name,
      });
    }
  }

  if (lines.length === 0) {
    warnings.push("No se generaron líneas para el asiento (todas las cuentas fueron omitidas)");
    return { journalEntryId: null, warnings };
  }

  // Get next JE number
  const lastJE = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const nextNumber = (lastJE?.number ?? 0) + 1;

  // Create journal entry with lines
  const je = await (db as any).journalEntry.create({
    data: {
      number: nextNumber,
      date: periodDate,
      description: `Asiento de apertura — ${periodDate.toISOString().slice(0, 10)}`,
      type: "OPENING",
      status: "DRAFT",
      reference: `APERTURA-${periodDate.toISOString().slice(0, 10)}`,
      sourceType: "OPENING_BALANCE_IMPORT",
      lines: {
        create: lines,
      },
    },
  });

  return { journalEntryId: je.id, warnings };
}
