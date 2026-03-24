/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedPrisma } from "@/lib/db-scoped";
import { registerSupportingDocument } from "./supporting-docs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveAccountId(db: ScopedPrisma, code: string): Promise<string> {
  const account = await db.account.findFirst({
    where: { code },
    select: { id: true },
  });
  if (!account) throw new Error(`Account ${code} not found`);
  return account.id;
}

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
// Regularization (cierre de cuentas de gastos e ingresos)
// ---------------------------------------------------------------------------

export interface RegularizationResult {
  documentId: string;
  journalEntryId: string;
  totalExpenses: number;
  totalIncome: number;
  netResult: number;
}

/**
 * Creates the regularization entry that zeros out group 6 (expenses) and
 * group 7 (income) accounts, transferring the result to account 129.
 */
export async function createRegularizationEntry(
  db: ScopedPrisma,
  fiscalYear: number
): Promise<RegularizationResult> {
  // Get all accounts in groups 6 and 7
  const allAccounts = await db.account.findMany({
    where: {
      OR: [{ code: { startsWith: "6" } }, { code: { startsWith: "7" } }],
    },
    select: { id: true, code: true },
  });

  const startDate = new Date(fiscalYear, 0, 1);
  const endDate = new Date(fiscalYear + 1, 0, 1);

  // Calculate balance for each account in the fiscal year
  type AccountWithBalance = { id: string; code: string; balance: number };
  const accountsWithBalance: AccountWithBalance[] = [];

  for (const acct of allAccounts) {
    const lines = await (db as any).journalEntryLine.findMany({
      where: {
        accountId: acct.id,
        journalEntry: {
          date: { gte: startDate, lt: endDate },
          status: { in: ["DRAFT", "POSTED"] },
        },
      },
      select: { debit: true, credit: true },
    });

    let balance = 0;
    for (const line of lines) {
      balance += (line.debit ?? 0) - (line.credit ?? 0);
    }

    if (Math.abs(balance) > 0.001) {
      accountsWithBalance.push({ id: acct.id, code: acct.code, balance });
    }
  }

  // Group 6: debit balance (expenses). To zero: credit them.
  // Group 7: credit balance (income). To zero: debit them.
  let totalExpenses = 0;
  let totalIncome = 0;

  const jeLines: Array<{
    accountId: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];

  for (const acct of accountsWithBalance) {
    if (acct.code.startsWith("6")) {
      // Expense account with debit balance → credit to zero
      totalExpenses += Math.abs(acct.balance);
      jeLines.push({
        accountId: acct.id,
        description: `Regularización ${acct.code}`,
        debit: acct.balance < 0 ? Math.abs(acct.balance) : 0,
        credit: acct.balance > 0 ? acct.balance : 0,
      });
    } else if (acct.code.startsWith("7")) {
      // Income account with credit balance → debit to zero
      totalIncome += Math.abs(acct.balance);
      jeLines.push({
        accountId: acct.id,
        description: `Regularización ${acct.code}`,
        debit: acct.balance < 0 ? Math.abs(acct.balance) : 0,
        credit: acct.balance > 0 ? acct.balance : 0,
      });
    }
  }

  // Net result: income > expense → profit (credit 129); else loss (debit 129)
  const netResult = totalIncome - totalExpenses;
  const account129Id = await resolveAccountId(db, "129");

  if (netResult > 0) {
    // Profit → 129 credit
    jeLines.push({
      accountId: account129Id,
      description: "Resultado del ejercicio (beneficio)",
      debit: 0,
      credit: netResult,
    });
  } else if (netResult < 0) {
    // Loss → 129 debit
    jeLines.push({
      accountId: account129Id,
      description: "Resultado del ejercicio (pérdida)",
      debit: Math.abs(netResult),
      credit: 0,
    });
  }

  const regularizationDate = new Date(fiscalYear, 11, 31);

  const result = await registerSupportingDocument(db, {
    type: "ACTA_JUNTA",
    description: `Regularización de resultados ejercicio ${fiscalYear}`,
    date: regularizationDate,
    amount: Math.abs(netResult),
    expectedDirection: "NONE",
  });

  // Now create a proper journal entry with all lines
  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const je = await (db as any).journalEntry.create({
    data: {
      number: (lastEntry?.number ?? 0) + 1,
      date: regularizationDate,
      description: `Regularización de resultados — Ejercicio ${fiscalYear}`,
      status: "DRAFT",
      type: "CLOSING",
      lines: { create: jeLines },
    },
  });

  // Link the supporting document to this detailed JE instead
  await (db as any).supportingDocument.update({
    where: { id: result.documentId },
    data: { journalEntryId: je.id },
  });

  return {
    documentId: result.documentId,
    journalEntryId: je.id,
    totalExpenses,
    totalIncome,
    netResult,
  };
}

// ---------------------------------------------------------------------------
// Distribution (reparto de resultados)
// ---------------------------------------------------------------------------

export interface DistributionInput {
  toReservaLegal: number; // → 112
  toReservasVoluntarias: number; // → 113
  toDividendos: number; // → 526
  toCompensarPerdidas: number; // → 120
}

export interface DistributionResult {
  distributionDocId: string;
  distributionJeId: string;
  dividendDocId?: string;
  dividendJeId?: string;
}

/**
 * Creates the result distribution entry (D129 / H112+H113+H526+H120).
 * If dividends > 0, also creates a separate dividend payment doc (D526/H572).
 *
 * Validations:
 * 1. Sum of distribution must equal balance of 129
 * 2. If account 121 has debit balance → toCompensarPerdidas must be > 0
 * 3. If reservaLegal(112) < 20% of capital(100) → toReservaLegal >= 10% of result
 * 4. If result < 0 → toDividendos must be 0
 */
export async function createDistributionEntry(
  db: ScopedPrisma,
  dist: DistributionInput
): Promise<DistributionResult> {
  const resultBalance = await getAccountBalance(db, "129");
  const priorLosses = await getAccountBalance(db, "121"); // debit balance = losses
  const reservaLegal = await getAccountBalance(db, "112");
  const capital = await getAccountBalance(db, "100");

  const totalDistribution =
    dist.toReservaLegal + dist.toReservasVoluntarias + dist.toDividendos + dist.toCompensarPerdidas;

  // Validation 1: sum must equal balance of 129
  // 129 credit balance = profit (negative in our debit-positive convention when credit > debit)
  // Actually: 129 credit balance means resultBalance < 0 in debit-minus-credit
  const absResult = Math.abs(resultBalance);
  if (Math.abs(totalDistribution - absResult) > 0.01) {
    throw new Error(
      `Distribution total (${totalDistribution}) must equal result balance (${absResult})`
    );
  }

  // Validation 2: if 121 has debit balance (prior losses), must compensate
  if (priorLosses > 0.01 && dist.toCompensarPerdidas <= 0) {
    throw new Error("Account 121 has prior losses — toCompensarPerdidas must be > 0");
  }

  // Validation 3: reserva legal < 20% capital → must allocate >= 10% of result
  const capitalAbs = Math.abs(capital);
  const reservaLegalAbs = Math.abs(reservaLegal);
  if (
    capitalAbs > 0 &&
    reservaLegalAbs < capitalAbs * 0.2 &&
    resultBalance < -0.01 && // profit
    dist.toReservaLegal < absResult * 0.1 - 0.01
  ) {
    throw new Error("Reserva legal < 20% of capital — toReservaLegal must be >= 10% of result");
  }

  // Validation 4: if result is a loss, no dividends
  if (resultBalance > 0.01 && dist.toDividendos > 0) {
    throw new Error("Result is a loss — toDividendos must be 0");
  }

  // Build journal entry lines (only for non-zero amounts)
  const account129Id = await resolveAccountId(db, "129");
  const jeLines: Array<{
    accountId: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];

  // Debit 129 (remove the result)
  jeLines.push({
    accountId: account129Id,
    description: "Aplicación resultado del ejercicio",
    debit: absResult,
    credit: 0,
  });

  if (dist.toReservaLegal > 0) {
    const id = await resolveAccountId(db, "112");
    jeLines.push({
      accountId: id,
      description: "Dotación reserva legal",
      debit: 0,
      credit: dist.toReservaLegal,
    });
  }

  if (dist.toReservasVoluntarias > 0) {
    const id = await resolveAccountId(db, "113");
    jeLines.push({
      accountId: id,
      description: "Dotación reservas voluntarias",
      debit: 0,
      credit: dist.toReservasVoluntarias,
    });
  }

  if (dist.toDividendos > 0) {
    const id = await resolveAccountId(db, "526");
    jeLines.push({
      accountId: id,
      description: "Dividendos a pagar",
      debit: 0,
      credit: dist.toDividendos,
    });
  }

  if (dist.toCompensarPerdidas > 0) {
    const id = await resolveAccountId(db, "120");
    jeLines.push({
      accountId: id,
      description: "Compensación pérdidas ejercicios anteriores",
      debit: 0,
      credit: dist.toCompensarPerdidas,
    });
  }

  const distDate = new Date();

  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const je = await (db as any).journalEntry.create({
    data: {
      number: (lastEntry?.number ?? 0) + 1,
      date: distDate,
      description: "Aplicación del resultado del ejercicio",
      status: "DRAFT",
      type: "ADJUSTMENT",
      lines: { create: jeLines },
    },
  });

  const distDoc = await (db as any).supportingDocument.create({
    data: {
      type: "ACTA_JUNTA",
      description: "Aplicación del resultado del ejercicio",
      date: distDate,
      amount: absResult,
      debitAccountCode: "129",
      creditAccountCode: "112",
      cashflowType: "FINANCING",
      expectedDirection: "NONE",
      distributionDetail: {
        toReservaLegal: dist.toReservaLegal,
        toReservasVoluntarias: dist.toReservasVoluntarias,
        toDividendos: dist.toDividendos,
        toCompensarPerdidas: dist.toCompensarPerdidas,
      },
      journalEntryId: je.id,
      status: "PENDING_APPROVAL",
    },
  });

  const result: DistributionResult = {
    distributionDocId: distDoc.id,
    distributionJeId: je.id,
  };

  // If dividends > 0, create a separate dividend payment document
  if (dist.toDividendos > 0) {
    const divResult = await registerSupportingDocument(db, {
      type: "ACTA_JUNTA",
      description: "Pago de dividendos",
      date: distDate,
      amount: dist.toDividendos,
      debitAccountCode: "526",
      creditAccountCode: "572",
      cashflowType: "FINANCING",
      expectedDirection: "OUTFLOW",
      expectedAmount: dist.toDividendos,
    });
    result.dividendDocId = divResult.documentId;
    result.dividendJeId = divResult.journalEntryId;
  }

  return result;
}
