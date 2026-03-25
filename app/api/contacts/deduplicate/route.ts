/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { callAIJson } from "@/lib/ai/model-router";
import { DEDUPLICATE_CONTACTS } from "@/lib/ai/prompt-registry";
import { normalizeNif } from "@/lib/contacts/utils";

/**
 * Pick the canonical contact — the one with the most filled fields.
 */
function pickCanonical(contacts: any[]): any {
  const fillableFields = [
    "email",
    "iban",
    "accountingEmail",
    "accountingContact",
    "paymentTermsDays",
    "irpfApplicable",
    "irpfRateImplied",
    "typicalAmountAvg",
    "avgPaymentDays",
    "cif",
  ];
  return contacts.reduce((best, c) => {
    const score = fillableFields.filter((f) => c[f] != null).length;
    const bestScore = fillableFields.filter((f) => best[f] != null).length;
    return score > bestScore ? c : best;
  });
}

export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const allContacts = await db.contact.findMany({
      orderBy: { createdAt: "asc" },
    });

    // ── Phase 1: Deterministic dedup by normalized NIF ──
    const nifGroups = new Map<string, any[]>();
    const noNifContacts: any[] = [];

    for (const contact of allContacts) {
      const nif = normalizeNif((contact as any).cif);
      if (nif) {
        const group = nifGroups.get(nif) ?? [];
        group.push(contact);
        nifGroups.set(nif, group);
      } else {
        noNifContacts.push(contact);
      }
    }

    let autoMerged = 0;
    const mergeErrors: string[] = [];

    const nifEntries = Array.from(nifGroups.values());
    for (const group of nifEntries) {
      if (group.length <= 1) continue;

      const canonical = pickCanonical(group);
      const duplicates = group.filter((c: any) => c.id !== canonical.id);

      for (const dup of duplicates) {
        try {
          // Move invoice relations to canonical
          await (db as any).invoice.updateMany({
            where: { contactId: dup.id },
            data: { contactId: canonical.id },
          });
          // Delete duplicate
          await (db as any).contact.delete({ where: { id: dup.id } });
          autoMerged++;
        } catch (err) {
          mergeErrors.push(`${dup.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // ── Phase 2: AI-based dedup for ambiguous contacts ──
    const proposals: any[] = [];

    // Only call AI if we have enough ambiguous contacts to justify it
    if (noNifContacts.length >= 2) {
      const contactSummary = noNifContacts
        .map(
          (c: any) =>
            `ID:${c.id} | Name:${c.name} | Email:${c.email ?? "?"} | ` +
            `IBAN:${c.iban ?? "?"} | Type:${c.type}`
        )
        .join("\n");

      try {
        const aiResult = await callAIJson(
          "deduplicate_contacts",
          DEDUPLICATE_CONTACTS.system,
          DEDUPLICATE_CONTACTS.buildUser({ contacts: contactSummary }),
          DEDUPLICATE_CONTACTS.schema
        );

        if (!aiResult) throw new Error("AI returned null");
        for (const group of aiResult.duplicateGroups) {
          proposals.push({
            contactIds: group.contactIds,
            confidence: group.confidence,
            reason: group.reason,
            canonicalId: group.canonicalId,
          });
        }
      } catch {
        // AI failure is non-fatal — we still return deterministic results
      }
    }

    return NextResponse.json({
      autoMerged,
      proposals,
      totalContacts: allContacts.length,
      errors: mergeErrors,
    });
  } catch (err) {
    return errorResponse("Error al deduplicar contactos.", err);
  }
}, "manage:settings");
