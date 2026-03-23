import type { ScopedPrisma } from "@/lib/db-scoped";
import type { PeriodStatus } from "@prisma/client";

/**
 * Checks whether a date falls within an open accounting period.
 * Returns null if the period is open (or doesn't exist yet).
 * Returns an error message if the period is closed or locked.
 */
export async function checkPeriodOpen(
  db: ScopedPrisma,
  companyId: string,
  date: Date
): Promise<string | null> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const period = await db.accountingPeriod.findUnique({
    where: {
      companyId_year_month: { companyId, year, month },
    },
    select: { status: true },
  });

  if (!period) return null;

  if (period.status === "CLOSED") {
    return `El periodo ${month}/${year} está cerrado. Reábralo para hacer cambios.`;
  }

  if (period.status === "LOCKED") {
    return `El periodo ${month}/${year} está bloqueado permanentemente.`;
  }

  return null;
}

/**
 * Returns the status of a period, or "OPEN" if it doesn't exist.
 */
export async function getPeriodStatus(
  db: ScopedPrisma,
  companyId: string,
  year: number,
  month: number
): Promise<PeriodStatus> {
  const period = await db.accountingPeriod.findUnique({
    where: {
      companyId_year_month: { companyId, year, month },
    },
    select: { status: true },
  });

  return period?.status ?? "OPEN";
}
