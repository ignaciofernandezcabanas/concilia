/**
 * Syncs bank transactions from GoCardless (Nordigen) into the local database.
 *
 * Field mapping:
 *   transactionId         → externalId
 *   valueDate             → valueDate
 *   bookingDate           → bookingDate
 *   transactionAmount.amount → amount
 *   creditorName/debtorName  → counterpartName
 *   creditorAccount/debtorAccount IBAN → counterpartIban
 *   remittanceInformationUnstructured → concept
 */

import { prisma } from "@/lib/db";
import { GoCardlessClient, type GoCardlessTransaction } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncBankTransactionsResult {
  created: number;
  updated: number;
  errors: Array<{ externalId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function syncBankTransactions(
  companyId: string,
  accountId: string,
  secretId: string,
  secretKey: string
): Promise<SyncBankTransactionsResult> {
  const client = new GoCardlessClient(secretId, secretKey);
  const result: SyncBankTransactionsResult = {
    created: 0,
    updated: 0,
    errors: [],
  };

  // Determine date range: fetch from last sync or last 90 days
  const lastSync = await prisma.syncLog.findFirst({
    where: {
      companyId,
      source: "gocardless",
      action: "sync-transactions",
      status: "success",
    },
    orderBy: { startedAt: "desc" },
  });

  const dateFrom = lastSync
    ? formatIsoDate(lastSync.startedAt)
    : formatIsoDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  const dateTo = formatIsoDate(new Date());

  const response = await client.getTransactions(accountId, dateFrom, dateTo);
  const transactions = response.transactions.booked;

  for (const tx of transactions) {
    const externalId = tx.transactionId || tx.internalTransactionId;
    if (!externalId) {
      result.errors.push({
        externalId: "unknown",
        error: "Transaction has no transactionId or internalTransactionId",
      });
      continue;
    }

    try {
      const data = mapTransaction(tx, externalId, companyId);

      const existing = await prisma.bankTransaction.findUnique({
        where: {
          externalId_companyId: { externalId, companyId },
        },
      });

      if (existing) {
        // Only update fields that may change; preserve user-managed fields
        await prisma.bankTransaction.update({
          where: { id: existing.id },
          data: {
            bookingDate: data.bookingDate,
            amount: data.amount,
            currency: data.currency,
            concept: data.concept,
            counterpartName: data.counterpartName,
            counterpartIban: data.counterpartIban,
            reference: data.reference,
            syncedAt: new Date(),
          },
        });
        result.updated++;
      } else {
        await prisma.bankTransaction.create({ data });
        result.created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[syncBankTransactions] Error processing tx ${externalId}: ${message}`);
      result.errors.push({ externalId, error: message });
    }
  }

  await prisma.syncLog.create({
    data: {
      companyId,
      source: "gocardless",
      action: "sync-transactions",
      status: result.errors.length === 0 ? "success" : "partial",
      recordsProcessed: transactions.length,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      completedAt: new Date(),
    },
  });

  console.log(
    `[syncBankTransactions] company=${companyId} account=${accountId} created=${result.created} updated=${result.updated} errors=${result.errors.length}`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapTransaction(tx: GoCardlessTransaction, externalId: string, companyId: string) {
  const amount = parseFloat(tx.transactionAmount.amount);
  const isCredit = amount > 0;

  // For credits: the counterpart is the debtor (who paid us)
  // For debits: the counterpart is the creditor (who we paid)
  const counterpartName = isCredit
    ? (tx.debtorName ?? tx.creditorName ?? null)
    : (tx.creditorName ?? tx.debtorName ?? null);

  const counterpartIban = isCredit
    ? (tx.debtorAccount?.iban ?? tx.creditorAccount?.iban ?? null)
    : (tx.creditorAccount?.iban ?? tx.debtorAccount?.iban ?? null);

  // Build concept from remittance info
  const concept =
    tx.remittanceInformationUnstructured ??
    tx.remittanceInformationUnstructuredArray?.join(" ") ??
    tx.additionalInformation ??
    null;

  return {
    externalId,
    valueDate: new Date(tx.valueDate),
    bookingDate: tx.bookingDate ? new Date(tx.bookingDate) : null,
    amount,
    currency: tx.transactionAmount.currency || "EUR",
    concept,
    counterpartName,
    counterpartIban,
    reference: tx.bankTransactionCode ?? null,
    syncedAt: new Date(),
    companyId,
  };
}

function formatIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
