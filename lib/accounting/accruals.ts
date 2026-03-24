/**
 * Recurring accruals processor.
 *
 * For each active accrual, creates a monthly journal entry:
 *   Debe: expense account (62x, 63x...)
 *   Haber: accrual/deferral account (480, 485)
 *
 * When linked to an invoice, optionally reverses accumulated accruals.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedPrisma } from "@/lib/db-scoped";

export interface AccrualResult {
  accrualsProcessed: number;
  entriesCreated: number;
  totalAccrued: number;
  reversed: number;
  errors: Array<{ accrualId: string; error: string }>;
}

/** Resolve an account code to its ID. Throws if not found. */
async function resolveAccountId(db: ScopedPrisma, code: string): Promise<string> {
  const account = await db.account.findFirst({ where: { code }, select: { id: true } });
  if (!account) throw new Error(`Account ${code} not found`);
  return account.id;
}

export async function processRecurringAccruals(
  db: ScopedPrisma,
  periodDate: Date
): Promise<AccrualResult> {
  const result: AccrualResult = {
    accrualsProcessed: 0,
    entriesCreated: 0,
    totalAccrued: 0,
    reversed: 0,
    errors: [],
  };

  const year = periodDate.getFullYear();
  const month = periodDate.getMonth(); // 0-indexed

  const accruals = await (db as any).recurringAccrual.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: periodDate },
    },
  });

  // Get next journal entry number
  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let nextNumber = (lastEntry?.number ?? 0) + 1;

  for (const accrual of accruals) {
    try {
      // Skip if endDate passed
      if (accrual.endDate && accrual.endDate < periodDate) continue;

      // Skip if already accrued for this month
      if (accrual.lastAccruedDate) {
        const lastY = accrual.lastAccruedDate.getFullYear();
        const lastM = accrual.lastAccruedDate.getMonth();
        if (lastY === year && lastM === month) continue;
      }

      // Check frequency
      const realMonth = month + 1;
      if (accrual.frequency === "QUARTERLY" && realMonth % 3 !== 0) continue;
      if (accrual.frequency === "ANNUAL" && realMonth !== 12) continue;

      const amount = accrual.monthlyAmount;
      const monthLabel = `${String(realMonth).padStart(2, "0")}/${year}`;

      // Resolve accounts
      const expenseAccountId = await resolveAccountId(db, accrual.expenseAccountCode);
      const accrualAccountId = await resolveAccountId(db, accrual.accrualAccountCode);

      // Create journal entry as DRAFT
      await (db as any).journalEntry.create({
        data: {
          number: nextNumber++,
          date: periodDate,
          description: `Periodificación ${monthLabel} — ${accrual.description}`,
          status: "DRAFT",
          type: "ADJUSTMENT",
          recurringAccrualId: accrual.id,
          lines: {
            create: [
              {
                accountId: expenseAccountId,
                description: accrual.description,
                debit: amount,
                credit: 0,
              },
              {
                accountId: accrualAccountId,
                description: `Periodificación ${accrual.description}`,
                debit: 0,
                credit: amount,
              },
            ],
          },
        },
      });

      // Update accrual tracking
      await (db as any).recurringAccrual.update({
        where: { id: accrual.id },
        data: {
          lastAccruedDate: periodDate,
          totalAccrued: { increment: amount },
        },
      });

      result.accrualsProcessed++;
      result.entriesCreated++;
      result.totalAccrued += amount;
    } catch (err) {
      result.errors.push({
        accrualId: accrual.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Link an accrual to its real invoice. If autoReverse, creates a reversal entry.
 */
export async function linkAccrualToInvoice(
  db: ScopedPrisma,
  accrualId: string,
  invoiceId: string
): Promise<{ reversed: boolean; reversalAmount: number }> {
  const accrual = await (db as any).recurringAccrual.findUniqueOrThrow({
    where: { id: accrualId },
  });

  if (accrual.status !== "ACTIVE") {
    throw new Error("Accrual is not active");
  }

  let reversed = false;
  let reversalAmount = 0;

  if (accrual.autoReverse && accrual.totalAccrued > 0) {
    reversalAmount = accrual.totalAccrued;

    const expenseAccountId = await resolveAccountId(db, accrual.expenseAccountCode);
    const accrualAccountId = await resolveAccountId(db, accrual.accrualAccountCode);

    const lastEntry = await db.journalEntry.findFirst({
      orderBy: { number: "desc" },
      select: { number: true },
    });

    await (db as any).journalEntry.create({
      data: {
        number: (lastEntry?.number ?? 0) + 1,
        date: new Date(),
        description: `Reversión periodificación — ${accrual.description}`,
        status: "DRAFT",
        type: "ADJUSTMENT",
        recurringAccrualId: accrualId,
        lines: {
          create: [
            {
              accountId: accrualAccountId,
              description: `Reversión ${accrual.description}`,
              debit: reversalAmount,
              credit: 0,
            },
            {
              accountId: expenseAccountId,
              description: `Reversión ${accrual.description}`,
              debit: 0,
              credit: reversalAmount,
            },
          ],
        },
      },
    });

    reversed = true;
  }

  await (db as any).recurringAccrual.update({
    where: { id: accrualId },
    data: {
      linkedInvoiceId: invoiceId,
      status: "COMPLETED",
    },
  });

  return { reversed, reversalAmount };
}
