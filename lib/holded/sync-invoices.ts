/**
 * Syncs invoices (issued + received) from Holded into the local database.
 *
 * - Fetches all invoices and purchases via Holded API.
 * - Upserts each record keyed on (holdedId, companyId).
 * - Holded dates are Unix timestamps (seconds) and are converted to Date.
 */

import { prisma } from "@/lib/db";
import { HoldedClient, type HoldedInvoice } from "./client";
import type { InvoiceType, InvoiceStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncInvoicesResult {
  created: number;
  updated: number;
  errors: Array<{ holdedId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function syncInvoices(
  companyId: string,
  apiKey: string,
): Promise<SyncInvoicesResult> {
  const client = new HoldedClient(apiKey);
  const result: SyncInvoicesResult = { created: 0, updated: 0, errors: [] };

  // Determine last successful sync to enable incremental fetching
  const lastSync = await prisma.syncLog.findFirst({
    where: { companyId, source: "holded", action: "sync-invoices", status: "success" },
    orderBy: { startedAt: "desc" },
  });
  const updatedAfter = lastSync?.startedAt ?? undefined;

  // Fetch both issued and received invoices
  const [issued, received] = await Promise.all([
    client.getAllInvoices(updatedAfter),
    client.getAllPurchases(updatedAfter),
  ]);

  const invoicesWithType: Array<{ doc: HoldedInvoice; type: InvoiceType }> = [
    ...issued.map((doc) => ({ doc, type: "ISSUED" as InvoiceType })),
    ...received.map((doc) => ({ doc, type: "RECEIVED" as InvoiceType })),
  ];

  for (const { doc, type } of invoicesWithType) {
    try {
      const data = mapHoldedInvoice(doc, type, companyId);

      const existing = await prisma.invoice.findUnique({
        where: { holdedId_companyId: { holdedId: doc.id, companyId } },
      });

      if (existing) {
        await prisma.invoice.update({
          where: { id: existing.id },
          data: {
            ...data,
            // Preserve fields managed outside sync
            driveFileId: undefined,
            provisionType: undefined,
            provisionedAmount: undefined,
          },
        });
        result.updated++;
      } else {
        await prisma.invoice.create({ data });
        result.created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[syncInvoices] Error processing invoice ${doc.id}: ${message}`,
      );
      result.errors.push({ holdedId: doc.id, error: message });
    }
  }

  // Write sync log
  await prisma.syncLog.create({
    data: {
      companyId,
      source: "holded",
      action: "sync-invoices",
      status: result.errors.length === 0 ? "success" : "partial",
      recordsProcessed: invoicesWithType.length,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      completedAt: new Date(),
    },
  });

  console.log(
    `[syncInvoices] company=${companyId} created=${result.created} updated=${result.updated} errors=${result.errors.length}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapHoldedInvoice(
  doc: HoldedInvoice,
  type: InvoiceType,
  companyId: string,
) {
  return {
    holdedId: doc.id,
    number: doc.docNumber,
    type,
    issueDate: unixToDate(doc.date),
    dueDate: doc.dueDate ? unixToDate(doc.dueDate) : null,
    totalAmount: doc.total,
    netAmount: doc.subtotal,
    vatAmount: doc.tax,
    currency: doc.currency || "EUR",
    description: doc.desc ?? null,
    status: mapHoldedStatus(doc.status, doc.total, doc.paid),
    amountPaid: doc.paid ?? 0,
    amountPending: roundTwo(doc.total - (doc.paid ?? 0)),
    syncedAt: new Date(),
    companyId,
    // contactId is resolved separately by matching holdedId
    ...(doc.contactId
      ? {
          contact: {
            connect: {
              holdedId_companyId: {
                holdedId: doc.contactId,
                companyId,
              },
            },
          },
        }
      : {}),
    lines: {
      // Delete previous lines and recreate to handle changes
      deleteMany: {},
      create: (doc.items ?? []).map((item) => ({
        description: item.name,
        quantity: item.units,
        unitPrice: item.subtotal / (item.units || 1),
        totalAmount: item.total,
        vatRate: item.units > 0 ? (item.tax / item.subtotal) * 100 : 0,
      })),
    },
  };
}

/**
 * Map Holded numeric status to our InvoiceStatus enum.
 *
 * Holded statuses: 0 = draft, 1 = pending, 2 = paid, 3 = overdue, 4 = cancelled
 */
function mapHoldedStatus(
  holdedStatus: number,
  total: number,
  paid: number,
): InvoiceStatus {
  switch (holdedStatus) {
    case 2:
      return "PAID";
    case 3:
      return "OVERDUE";
    case 4:
      return "CANCELLED";
    default:
      // Check partial payment
      if (paid > 0 && paid < total) return "PARTIAL";
      return "PENDING";
  }
}

function unixToDate(timestamp: number): Date {
  // Holded uses Unix timestamps in seconds
  return new Date(timestamp * 1000);
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
