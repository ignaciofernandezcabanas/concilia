/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bad Debt Tracker — monitors overdue invoices, manages provisions,
 * and tracks tax deductibility per Spanish fiscal rules.
 *
 * PGC accounts:
 *   694 — Pérdidas por deterioro de créditos comerciales
 *   490 — Deterioro de valor de créditos comerciales
 *
 * Tax deductibility rules (LIS Art. 13):
 *   - >= 6 months overdue AND formal claim (burofax, judicial, notarial)
 *   - DEBTOR_INSOLVENCY → deductible immediately regardless of months
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

export interface BadDebtScanResult {
  monitored: number;
  provisionAccounting: number;
  provisionTax: number;
  totalAmount: number;
  created: number;
  updated: number;
}

/**
 * Scan for overdue invoices and create/update BadDebtTracker records.
 */
export async function scanBadDebts(
  db: ScopedPrisma,
  referenceDate: Date
): Promise<BadDebtScanResult> {
  const result: BadDebtScanResult = {
    monitored: 0,
    provisionAccounting: 0,
    provisionTax: 0,
    totalAmount: 0,
    created: 0,
    updated: 0,
  };

  // 1. Find ISSUED invoices with status OVERDUE and dueDate > 90 days ago
  const ninetyDaysAgo = new Date(referenceDate);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const overdueInvoices = await db.invoice.findMany({
    where: {
      type: "ISSUED",
      status: "OVERDUE",
      dueDate: { lte: ninetyDaysAgo },
    },
    select: {
      id: true,
      totalAmount: true,
      amountPaid: true,
      dueDate: true,
    },
  });

  for (const inv of overdueInvoices) {
    const dueDate = inv.dueDate!;
    const diffMs = referenceDate.getTime() - dueDate.getTime();
    const overdueMonths = Math.floor(diffMs / (30.44 * 24 * 60 * 60 * 1000));
    const provisionAmount = inv.totalAmount - inv.amountPaid;

    // Check if tracker already exists
    const existing = await (db as any).badDebtTracker.findFirst({
      where: { invoiceId: inv.id },
    });

    if (existing) {
      // Update
      const isTaxDeductible = checkTaxDeductibility(overdueMonths, existing.claimType);

      await (db as any).badDebtTracker.update({
        where: { id: existing.id },
        data: {
          overdueMonths,
          provisionAmount,
          isTaxDeductible,
          taxDeductibleDate:
            isTaxDeductible && !existing.taxDeductibleDate
              ? referenceDate
              : existing.taxDeductibleDate,
          status: isTaxDeductible
            ? "PROVISION_TAX"
            : overdueMonths >= 3
              ? "PROVISION_ACCOUNTING"
              : "MONITORING",
        },
      });
      result.updated++;
    } else {
      // Create
      const isTaxDeductible = false; // New entries never have a claim yet

      await (db as any).badDebtTracker.create({
        data: {
          invoiceId: inv.id,
          overdueDate: dueDate,
          overdueMonths,
          provisionAmount,
          isTaxDeductible,
          status: overdueMonths >= 3 ? "PROVISION_ACCOUNTING" : "MONITORING",
        },
      });
      result.created++;
    }

    result.totalAmount += provisionAmount;

    // Tally by status
    const isTaxDeductible = existing
      ? checkTaxDeductibility(overdueMonths, existing.claimType)
      : false;

    if (isTaxDeductible) {
      result.provisionTax++;
    } else if (overdueMonths >= 3) {
      result.provisionAccounting++;
    } else {
      result.monitored++;
    }
  }

  return result;
}

/**
 * Check if a bad debt is tax deductible.
 * Rules:
 *   - DEBTOR_INSOLVENCY → always deductible
 *   - >= 6 months overdue AND has a claim → deductible
 *   - Otherwise → not deductible
 */
function checkTaxDeductibility(overdueMonths: number, claimType: string | null): boolean {
  if (claimType === "DEBTOR_INSOLVENCY") return true;
  return overdueMonths >= 6 && claimType !== null;
}

/**
 * Create a provision journal entry for a bad debt.
 * Debe 694 (Pérdidas por deterioro) / Haber 490 (Deterioro de valor)
 */
export async function createProvision(
  db: ScopedPrisma,
  badDebtId: string
): Promise<{ journalEntryId: string }> {
  const tracker = await (db as any).badDebtTracker.findUniqueOrThrow({
    where: { id: badDebtId },
  });

  if (tracker.provisionEntryId) {
    throw new Error("Provision already exists for this bad debt");
  }

  // Resolve accounts
  const account694 = await db.account.findFirst({
    where: { code: "694" },
    select: { id: true },
  });
  if (!account694) throw new Error("Account 694 not found");

  const account490 = await db.account.findFirst({
    where: { code: "490" },
    select: { id: true },
  });
  if (!account490) throw new Error("Account 490 not found");

  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const je = await (db as any).journalEntry.create({
    data: {
      number: (lastEntry?.number ?? 0) + 1,
      date: new Date(),
      description: `Provisión deterioro crédito comercial — factura ${tracker.invoiceId}`,
      status: "DRAFT",
      type: "ADJUSTMENT",
      lines: {
        create: [
          {
            accountId: account694.id,
            description: "Pérdidas por deterioro de créditos comerciales",
            debit: tracker.provisionAmount,
            credit: 0,
          },
          {
            accountId: account490.id,
            description: "Deterioro de valor de créditos comerciales",
            debit: 0,
            credit: tracker.provisionAmount,
          },
        ],
      },
    },
  });

  await (db as any).badDebtTracker.update({
    where: { id: badDebtId },
    data: { provisionEntryId: je.id },
  });

  return { journalEntryId: je.id };
}
