/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedPrisma } from "@/lib/db-scoped";

export function normalizeNif(nif: string | null | undefined): string | null {
  if (!nif) return null;
  return nif
    .replace(/[-.\s]/g, "")
    .toUpperCase()
    .trim();
}

export async function updateContactIfNewData(
  db: ScopedPrisma,
  existingId: string,
  existing: Record<string, any>,
  newData: Record<string, any>
): Promise<boolean> {
  const fillable = [
    "email",
    "iban",
    "accountingEmail",
    "accountingContact",
    "paymentTermsDays",
    "irpfApplicable",
    "irpfRateImplied",
    "preferredLanguage",
  ];
  const updates: Record<string, any> = {};
  for (const field of fillable) {
    if (existing[field] == null && newData[field] != null) {
      updates[field] = newData[field];
    }
  }
  if (Object.keys(updates).length === 0) return false;
  await (db as any).contact.update({ where: { id: existingId }, data: updates });
  return true;
}
