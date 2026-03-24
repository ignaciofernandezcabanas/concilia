import type { ScopedPrisma } from "@/lib/db-scoped";
import type { PeriodStatus } from "@prisma/client";

/**
 * Checks whether a date falls within a writable accounting period.
 * Returns null if allowed, error message string if blocked.
 *
 * @param isAutoEntry - If true, allows writes during SOFT_CLOSED (for depreciation, accruals)
 */
export async function checkPeriodOpen(
  db: ScopedPrisma,
  companyId: string,
  date: Date,
  isAutoEntry = false
): Promise<string | null> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const status = await getPeriodStatus(db, companyId, year, month);

  switch (status) {
    case "OPEN":
      return null; // All writes allowed

    case "SOFT_CLOSED":
      if (isAutoEntry) return null; // Auto entries (depreciation, accruals) allowed
      return `El periodo ${month}/${year} está en cierre provisional. Solo se permiten asientos automáticos.`;

    case "CLOSED":
      return `El periodo ${month}/${year} está cerrado. No se permiten operaciones.`;

    case "LOCKED":
      return `El periodo ${month}/${year} está bloqueado. No se permiten operaciones.`;

    default:
      return null;
  }
}

/**
 * Convenience function for auto-generated entries (depreciation, accruals).
 * Allows writes in OPEN and SOFT_CLOSED, blocks in CLOSED and LOCKED.
 */
export async function checkPeriodForAutoEntry(
  db: ScopedPrisma,
  companyId: string,
  date: Date
): Promise<string | null> {
  return checkPeriodOpen(db, companyId, date, true);
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
