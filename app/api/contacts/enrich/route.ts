/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { callAIJson } from "@/lib/ai/model-router";
import { ENRICH_CONTACT_FROM_HISTORY } from "@/lib/ai/prompt-registry";

const inputSchema = z.object({
  contactId: z.string().optional(),
  all: z.boolean().optional(),
});

const MAX_PER_CALL = 20;

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Input inválido.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { contactId, all } = parsed.data;

    // Select contacts to enrich
    let contacts: any[];
    if (contactId) {
      const c = await db.contact.findFirst({ where: { id: contactId } });
      contacts = c ? [c] : [];
    } else if (all) {
      contacts = await db.contact.findMany({
        where: { enrichedAt: null },
        take: MAX_PER_CALL,
      });
    } else {
      return NextResponse.json({ error: "Specify contactId or all:true." }, { status: 400 });
    }

    let enriched = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        // Find bank transactions: by contactId, then IBAN, then fuzzy name
        let transactions: any[] = [];

        // Strategy 1: Direct contactId match via invoices → reconciliations → bankTransaction
        const invoices = await db.invoice.findMany({
          where: { contactId: contact.id },
          select: { id: true },
        });
        if (invoices.length > 0) {
          const invoiceIds = invoices.map((inv: any) => inv.id);
          const reconciliations = await db.reconciliation.findMany({
            where: { invoiceId: { in: invoiceIds } },
            select: { bankTransactionId: true },
          });
          const txIds = reconciliations.map((r: any) => r.bankTransactionId).filter(Boolean);
          if (txIds.length > 0) {
            transactions = await db.bankTransaction.findMany({
              where: { id: { in: txIds } },
              orderBy: { valueDate: "desc" },
              take: 50,
            });
          }
        }

        // Strategy 2: IBAN fallback
        if (transactions.length === 0 && contact.iban) {
          transactions = await db.bankTransaction.findMany({
            where: { counterpartIban: contact.iban },
            orderBy: { valueDate: "desc" },
            take: 50,
          });
        }

        // Strategy 3: Fuzzy name in concept
        if (transactions.length === 0 && contact.name) {
          const nameWords = contact.name.split(/\s+/).filter((w: string) => w.length > 3);
          if (nameWords.length > 0) {
            transactions = await db.bankTransaction.findMany({
              where: {
                concept: { contains: nameWords[0], mode: "insensitive" },
              },
              orderBy: { valueDate: "desc" },
              take: 50,
            });
          }
        }

        // Skip if fewer than 3 movements
        if (transactions.length < 3) {
          await (db as any).contact.update({
            where: { id: contact.id },
            data: { enrichmentConfidence: "low" },
          });
          skipped++;
          continue;
        }

        // Build transaction summary for AI
        const txSummary = transactions
          .map(
            (tx: any) =>
              `${tx.valueDate?.toISOString?.()?.slice(0, 10) ?? ""} | ` +
              `${tx.amount} EUR | ${tx.concept ?? ""}`
          )
          .join("\n");

        const aiResult = await callAIJson(
          "enrich_contact_from_history",
          ENRICH_CONTACT_FROM_HISTORY.system,
          ENRICH_CONTACT_FROM_HISTORY.buildUser({
            contactName: contact.name,
            contactType: contact.type,
            transactions: txSummary,
          }),
          ENRICH_CONTACT_FROM_HISTORY.schema
        );

        if (!aiResult) {
          skipped++;
          continue;
        }

        // Update contact with enriched data
        const updateData: Record<string, any> = {
          enrichedAt: new Date(),
          enrichmentConfidence: aiResult.confidence,
        };

        if (aiResult.paymentTermsDays != null)
          updateData.paymentTermsDays = aiResult.paymentTermsDays;
        if (aiResult.typicalAmountAvg != null)
          updateData.typicalAmountAvg = aiResult.typicalAmountAvg;
        if (aiResult.irpfApplicable != null) updateData.irpfApplicable = aiResult.irpfApplicable;
        if (aiResult.irpfRateImplied != null) updateData.irpfRateImplied = aiResult.irpfRateImplied;
        if (aiResult.latePaymentRisk != null) updateData.latePaymentRisk = aiResult.latePaymentRisk;
        if (aiResult.avgPaymentDays != null) updateData.avgPaymentDays = aiResult.avgPaymentDays;

        await (db as any).contact.update({
          where: { id: contact.id },
          data: updateData,
        });

        enriched++;
      } catch (err) {
        errors.push(`${contact.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({ enriched, skipped, errors });
  } catch (err) {
    return errorResponse("Error al enriquecer contactos.", err);
  }
}, "manage:settings");
