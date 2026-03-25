/**
 * Syncs payment records from Holded and updates Invoice.amountPaid / amountPending.
 *
 * For each invoice in the database that has a holdedId, fetches payments from
 * the Holded API, upserts them, and recalculates the invoice totals.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { HoldedClient } from "./client";
import type { InvoiceStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncPaymentsResult {
  created: number;
  updated: number;
  invoicesUpdated: number;
  errors: Array<{ invoiceHoldedId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function syncPayments(
  db: ScopedPrisma,
  companyId: string,
  apiKey: string
): Promise<SyncPaymentsResult> {
  const client = new HoldedClient(apiKey);
  const result: SyncPaymentsResult = {
    created: 0,
    updated: 0,
    invoicesUpdated: 0,
    errors: [],
  };

  // Get all invoices that have a holdedId (i.e. synced from Holded)
  const invoices = await db.invoice.findMany({
    where: { companyId, holdedId: { not: null } },
    select: { id: true, holdedId: true, totalAmount: true },
  });

  for (const invoice of invoices) {
    if (!invoice.holdedId) continue;

    try {
      const payments = await client.getPayments(invoice.holdedId);
      for (const payment of payments) {
        const existing = payment.id
          ? await db.payment.findUnique({ where: { holdedId: payment.id } })
          : null;

        if (existing) {
          await db.payment.update({
            where: { id: existing.id },
            data: {
              amount: payment.amount,
              date: unixToDate(payment.date),
              method: payment.paymentMethod ?? payment.desc ?? null,
            },
          });
          result.updated++;
        } else {
          await db.payment.create({
            data: {
              holdedId: payment.id ?? null,
              amount: payment.amount,
              date: unixToDate(payment.date),
              method: payment.paymentMethod ?? payment.desc ?? null,
              invoiceId: invoice.id,
            },
          });
          result.created++;
        }
      }

      // Recalculate amountPaid from all payments in the database
      // (not just this batch, in case manual payments exist)
      const aggregation = await db.payment.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      });

      const amountPaid = roundTwo(aggregation._sum.amount ?? 0);
      const amountPending = roundTwo(invoice.totalAmount - amountPaid);
      const status = deriveStatus(amountPaid, amountPending, invoice.totalAmount);

      await db.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid, amountPending, status },
      });

      result.invoicesUpdated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[syncPayments] Error processing payments for invoice ${invoice.holdedId}: ${message}`
      );
      result.errors.push({
        invoiceHoldedId: invoice.holdedId,
        error: message,
      });
    }
  }

  await db.syncLog.create({
    data: {
      companyId,
      source: "holded",
      action: "sync-payments",
      status: result.errors.length === 0 ? "success" : "partial",
      recordsProcessed: invoices.length,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      completedAt: new Date(),
    },
  });

  console.log(
    `[syncPayments] company=${companyId} payments_created=${result.created} payments_updated=${result.updated} invoices_updated=${result.invoicesUpdated} errors=${result.errors.length}`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStatus(
  amountPaid: number,
  amountPending: number,
  totalAmount: number
): InvoiceStatus {
  // Use a small tolerance for floating-point comparison
  if (amountPending <= 0.01) return "PAID";
  if (amountPaid > 0.01 && amountPaid < totalAmount) return "PARTIAL";
  return "PENDING";
}

function unixToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
