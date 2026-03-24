/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Deferred Entries — Advances (anticipos) management.
 *
 * PGC accounts:
 *   438 — Anticipos de clientes (ADVANCE_RECEIVED)
 *   407 — Anticipos a proveedores (ADVANCE_PAID)
 *   572 — Bancos (contrapartida)
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

async function resolveAccountId(db: ScopedPrisma, code: string): Promise<string> {
  const account = await db.account.findFirst({
    where: { code },
    select: { id: true },
  });
  if (!account) throw new Error(`Account ${code} not found`);
  return account.id;
}

export async function registerAdvance(
  db: ScopedPrisma,
  payload: {
    type: "ADVANCE_RECEIVED" | "ADVANCE_PAID";
    contactId: string;
    amount: number;
    date: Date;
    description?: string;
    bankTransactionId?: string;
  }
): Promise<{ id: string }> {
  const accountCode = payload.type === "ADVANCE_RECEIVED" ? "438" : "407";
  const bankAccountId = await resolveAccountId(db, "572");
  const deferredAccountId = await resolveAccountId(db, accountCode);

  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  // Journal entry:
  // ADVANCE_RECEIVED: Debe 572 / Haber 438
  // ADVANCE_PAID: Debe 407 / Haber 572
  const lines =
    payload.type === "ADVANCE_RECEIVED"
      ? [
          {
            accountId: bankAccountId,
            description: "Cobro anticipo",
            debit: payload.amount,
            credit: 0,
          },
          {
            accountId: deferredAccountId,
            description: "Anticipo cliente",
            debit: 0,
            credit: payload.amount,
          },
        ]
      : [
          {
            accountId: deferredAccountId,
            description: "Anticipo a proveedor",
            debit: payload.amount,
            credit: 0,
          },
          {
            accountId: bankAccountId,
            description: "Pago anticipo",
            debit: 0,
            credit: payload.amount,
          },
        ];

  await (db as any).journalEntry.create({
    data: {
      number: (lastEntry?.number ?? 0) + 1,
      date: payload.date,
      description:
        payload.description ??
        `Anticipo ${payload.type === "ADVANCE_RECEIVED" ? "recibido" : "pagado"}`,
      status: "DRAFT",
      type: "ADJUSTMENT",
      lines: { create: lines },
    },
  });

  const entry = await (db as any).deferredEntry.create({
    data: {
      type: payload.type,
      contactId: payload.contactId,
      amount: payload.amount,
      remainingAmount: payload.amount,
      date: payload.date,
      description: payload.description,
      deferredAccountCode: accountCode,
      bankTransactionId: payload.bankTransactionId,
    },
  });

  return { id: entry.id };
}

export async function linkDeferredToInvoice(
  db: ScopedPrisma,
  deferredEntryId: string,
  invoiceId: string,
  applyAmount?: number
): Promise<void> {
  const entry = await (db as any).deferredEntry.findUniqueOrThrow({
    where: { id: deferredEntryId },
  });
  if (entry.status === "FULLY_APPLIED" || entry.status === "CANCELLED") {
    throw new Error("Deferred entry is already fully applied or cancelled");
  }

  const amount = applyAmount ?? entry.remainingAmount;
  if (amount > entry.remainingAmount) {
    throw new Error("Apply amount exceeds remaining");
  }

  const newConsumed = entry.consumedAmount + amount;
  const newRemaining = entry.amount - newConsumed;
  const newStatus = newRemaining <= 0.01 ? "FULLY_APPLIED" : "PARTIALLY_APPLIED";

  // Create reversal journal entry
  const bankAccountId = await resolveAccountId(db, "572");
  const deferredAccountId = await resolveAccountId(db, entry.deferredAccountCode);
  const lastEntry = await db.journalEntry.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const lines =
    entry.type === "ADVANCE_RECEIVED"
      ? [
          {
            accountId: deferredAccountId,
            description: "Aplicación anticipo",
            debit: amount,
            credit: 0,
          },
          {
            accountId: bankAccountId,
            description: "Aplicación anticipo",
            debit: 0,
            credit: amount,
          },
        ]
      : [
          {
            accountId: bankAccountId,
            description: "Aplicación anticipo",
            debit: amount,
            credit: 0,
          },
          {
            accountId: deferredAccountId,
            description: "Aplicación anticipo",
            debit: 0,
            credit: amount,
          },
        ];

  await (db as any).journalEntry.create({
    data: {
      number: (lastEntry?.number ?? 0) + 1,
      date: new Date(),
      description: "Aplicación anticipo a factura",
      status: "DRAFT",
      type: "ADJUSTMENT",
      lines: { create: lines },
    },
  });

  await (db as any).deferredEntry.update({
    where: { id: deferredEntryId },
    data: {
      consumedAmount: newConsumed,
      remainingAmount: newRemaining,
      status: newStatus,
      linkedInvoiceId: invoiceId,
    },
  });
}

export async function checkDeferredMatches(db: ScopedPrisma, _companyId: string): Promise<number> {
  // Find pending deferred entries and check if any new invoices match
  const pending = await (db as any).deferredEntry.findMany({
    where: { status: { in: ["PENDING", "PARTIALLY_APPLIED"] } },
    include: { contact: { select: { id: true, name: true } } },
  });

  let matchesFound = 0;
  for (const entry of pending) {
    const matchingInvoice = await db.invoice.findFirst({
      where: {
        contactId: entry.contactId,
        status: { in: ["PENDING", "PARTIAL"] },
        totalAmount: {
          gte: entry.remainingAmount * 0.95,
          lte: entry.remainingAmount * 1.05,
        },
      },
    });
    if (matchingInvoice) {
      matchesFound++;
      // Don't auto-link, just create notification
      await (db as any).notification.create({
        data: {
          type: "SYSTEM",
          title: "Anticipo pendiente coincide con factura",
          body: `El anticipo de ${entry.amount}€ de ${entry.contact?.name} coincide con la factura ${matchingInvoice.number}. ¿Aplicar?`,
          metadata: JSON.stringify({
            deferredEntryId: entry.id,
            invoiceId: matchingInvoice.id,
          }),
        },
      });
    }
  }
  return matchesFound;
}
