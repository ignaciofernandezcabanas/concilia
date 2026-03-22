/**
 * Syncs contacts from Holded into the local database.
 *
 * Upserts each contact keyed on (holdedId, companyId) and maps
 * Holded's type string to our ContactType enum.
 */

import { prisma } from "@/lib/db";
import { HoldedClient, type HoldedContact } from "./client";
import type { ContactType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncContactsResult {
  created: number;
  updated: number;
  errors: Array<{ holdedId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function syncContacts(
  companyId: string,
  apiKey: string,
): Promise<SyncContactsResult> {
  const client = new HoldedClient(apiKey);
  const result: SyncContactsResult = { created: 0, updated: 0, errors: [] };

  const contacts = await client.getAllContacts();

  for (const contact of contacts) {
    try {
      const data = mapContact(contact, companyId);

      await prisma.contact.upsert({
        where: {
          holdedId_companyId: { holdedId: contact.id, companyId },
        },
        create: data,
        update: {
          name: data.name,
          cif: data.cif,
          iban: data.iban,
          type: data.type,
        },
      });

      // We don't have a reliable way to distinguish create vs update from
      // upsert return value without a prior query, so count as updated when
      // the record already existed.
      const existed = await prisma.contact.findUnique({
        where: {
          holdedId_companyId: { holdedId: contact.id, companyId },
        },
        select: { createdAt: true, updatedAt: true },
      });

      if (existed && existed.createdAt.getTime() === existed.updatedAt.getTime()) {
        result.created++;
      } else {
        result.updated++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[syncContacts] Error processing contact ${contact.id}: ${message}`,
      );
      result.errors.push({ holdedId: contact.id, error: message });
    }
  }

  await prisma.syncLog.create({
    data: {
      companyId,
      source: "holded",
      action: "sync-contacts",
      status: result.errors.length === 0 ? "success" : "partial",
      recordsProcessed: contacts.length,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      completedAt: new Date(),
    },
  });

  console.log(
    `[syncContacts] company=${companyId} created=${result.created} updated=${result.updated} errors=${result.errors.length}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapContact(contact: HoldedContact, companyId: string) {
  return {
    holdedId: contact.id,
    name: contact.name,
    cif: contact.vatnumber ?? null,
    iban: contact.iban ?? null,
    type: mapContactType(contact.type),
    companyId,
  };
}

/**
 * Holded type values: "client", "supplier", "clientsupplier", "other"
 */
function mapContactType(holdedType: string): ContactType {
  switch (holdedType.toLowerCase()) {
    case "client":
      return "CUSTOMER";
    case "supplier":
      return "SUPPLIER";
    case "clientsupplier":
      return "BOTH";
    default:
      // Default "other" or unknown types to CUSTOMER
      return "CUSTOMER";
  }
}
