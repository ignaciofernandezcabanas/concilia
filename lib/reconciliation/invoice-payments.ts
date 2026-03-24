/**
 * Unified invoice payment status updater.
 *
 * Single source of truth for updating amountPaid, amountPending, and status
 * on an Invoice when a payment is matched or reversed.
 *
 * Uses consistent rounding: Math.round(value * 100) / 100
 * Tolerance for "fully paid": 0.01 EUR
 */

import type { PrismaClient } from "@prisma/client";

type PrismaTransaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const round = (n: number) => Math.round(n * 100) / 100;
const TOLERANCE = 0.01;

/**
 * Update an invoice's payment status after a payment/match is applied.
 *
 * @param invoiceId - The invoice to update
 * @param paidAmount - The amount being paid (positive = payment, negative = reversal)
 * @param tx - Prisma transaction client
 */
export async function updateInvoicePaymentStatus(
  invoiceId: string,
  paidAmount: number,
  tx: PrismaTransaction
): Promise<{
  newStatus: "PAID" | "PARTIAL" | "PENDING";
  newAmountPaid: number;
  newAmountPending: number;
}> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });

  const newAmountPaid = round(invoice.amountPaid + paidAmount);
  const newAmountPending = round(Math.max(0, invoice.totalAmount - newAmountPaid));

  let newStatus: "PAID" | "PARTIAL" | "PENDING";
  if (newAmountPending <= TOLERANCE) {
    newStatus = "PAID";
  } else if (newAmountPaid <= TOLERANCE) {
    newStatus = "PENDING";
  } else {
    newStatus = "PARTIAL";
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: newAmountPaid,
      amountPending: newAmountPending,
      status: newStatus,
    },
  });

  return { newStatus, newAmountPaid, newAmountPending };
}
