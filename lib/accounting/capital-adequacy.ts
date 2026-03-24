/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedPrisma } from "@/lib/db-scoped";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdequacyLevel = "OK" | "INFO" | "MEDIUM" | "CRITICAL";

export interface AdequacyAlert {
  level: AdequacyLevel;
  message: string;
}

export interface CapitalAdequacyResult {
  patrimonioNeto: number;
  capital: number;
  reservaLegal: number;
  ratio: number | null;
  alerts: AdequacyAlert[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccountBalance(db: ScopedPrisma, code: string): Promise<number> {
  const account = await db.account.findFirst({
    where: { code },
    select: { id: true },
  });
  if (!account) return 0;

  const lines = await (db as any).journalEntryLine.findMany({
    where: { accountId: account.id },
    select: { debit: true, credit: true },
  });

  let balance = 0;
  for (const line of lines) {
    balance += (line.debit ?? 0) - (line.credit ?? 0);
  }
  return balance;
}

// ---------------------------------------------------------------------------
// Capital Adequacy Check
// ---------------------------------------------------------------------------

/**
 * Checks capital adequacy per Spanish LSC (art. 363.1.e).
 *
 * Computes PN from equity accounts:
 *   (+) 100, 110, 112, 113, 114, 119, 120, 130, 131
 *   (-) 121, 108, 109
 *   (+/-) 129
 *
 * Alerts:
 * - PN/capital <= 0.5 → CRITICAL (disolución obligatoria)
 * - PN/capital <= 1.0 → MEDIUM
 * - reservaLegal(112) < 20% of capital(100) → INFO
 */
export async function checkCapitalAdequacy(db: ScopedPrisma): Promise<CapitalAdequacyResult> {
  // Positive contribution accounts (credit balance = positive PN)
  const positiveAccounts = ["100", "110", "112", "113", "114", "119", "120", "130", "131"];
  // Negative contribution accounts (debit balance = reduce PN)
  const negativeAccounts = ["121", "108", "109"];
  // Mixed (result of the year)
  const mixedAccounts = ["129"];

  let patrimonioNeto = 0;

  // For equity accounts, credit balance is positive (they're passive)
  // Our getAccountBalance returns debit - credit, so credit balance = negative value
  for (const code of positiveAccounts) {
    const bal = await getAccountBalance(db, code);
    // Credit balance (negative in debit-minus-credit) → positive PN contribution
    patrimonioNeto += Math.abs(bal);
  }

  for (const code of negativeAccounts) {
    const bal = await getAccountBalance(db, code);
    // Debit balance (positive in debit-minus-credit) → reduces PN
    patrimonioNeto -= Math.abs(bal);
  }

  for (const code of mixedAccounts) {
    const bal = await getAccountBalance(db, code);
    // 129: credit balance (profit) adds to PN, debit balance (loss) reduces it
    patrimonioNeto -= bal; // negative bal (credit) → adds; positive bal (debit) → subtracts
  }

  const capital = Math.abs(await getAccountBalance(db, "100"));
  const reservaLegal = Math.abs(await getAccountBalance(db, "112"));

  const ratio = capital > 0 ? patrimonioNeto / capital : null;
  const alerts: AdequacyAlert[] = [];

  if (ratio !== null) {
    if (ratio <= 0.5) {
      alerts.push({
        level: "CRITICAL",
        message: `PN/Capital = ${(ratio * 100).toFixed(1)}% — causa de disolución obligatoria (art. 363.1.e LSC)`,
      });
    } else if (ratio <= 1.0) {
      alerts.push({
        level: "MEDIUM",
        message: `PN/Capital = ${(ratio * 100).toFixed(1)}% — patrimonio neto inferior al capital social`,
      });
    }
  }

  if (capital > 0 && reservaLegal < capital * 0.2) {
    alerts.push({
      level: "INFO",
      message: `Reserva legal (${reservaLegal.toFixed(2)}) < 20% del capital (${(capital * 0.2).toFixed(2)}) — dotación obligatoria`,
    });
  }

  return {
    patrimonioNeto,
    capital,
    reservaLegal,
    ratio,
    alerts,
  };
}
