import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { draftInquiryEmail } from "@/lib/ai/inquiry-drafter";
import { z } from "zod";
import Fuse from "fuse.js";

const generateSchema = z.object({
  bankTransactionId: z.string().optional(),
  invoiceId: z.string().optional(),
  triggerType: z.enum(["MISSING_INVOICE", "MISSING_DOCUMENTATION", "EXPENSE_CLARIFICATION", "IC_CONFIRMATION"]),
  contactId: z.string().optional(),
  email: z.string().email().optional(),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "FORMAL", "URGENT"]).default("PROFESSIONAL"),
});

/**
 * POST /api/inquiries/generate — Generate a draft inquiry from a financial item
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // 1. Fetch item context
    let bankTx = null;
    let invoice = null;

    if (data.bankTransactionId) {
      bankTx = await db.bankTransaction.findUnique({
        where: { id: data.bankTransactionId },
        include: { reconciliations: { take: 1 } },
      });
    }
    if (data.invoiceId) {
      invoice = await db.invoice.findUnique({
        where: { id: data.invoiceId },
        include: { contact: true },
      });
    }

    // 2. Resolve contact (cascade)
    let contact = null;
    if (data.contactId) {
      contact = await db.contact.findUnique({ where: { id: data.contactId } });
    }
    if (!contact && invoice?.contact) {
      contact = invoice.contact;
    }
    if (!contact && bankTx?.counterpartIban) {
      contact = await db.contact.findFirst({ where: { iban: bankTx.counterpartIban } });
    }
    if (!contact && bankTx?.counterpartName) {
      const allContacts = await db.contact.findMany({ select: { id: true, name: true, email: true, accountingEmail: true } });
      const fuse = new Fuse(allContacts, { keys: ["name"], threshold: 0.4 });
      const results = fuse.search(bankTx.counterpartName);
      if (results.length === 1) {
        contact = await db.contact.findUnique({ where: { id: results[0].item.id } });
      } else if (results.length > 1) {
        return NextResponse.json({
          status: "CONTACT_NEEDED",
          suggestions: results.slice(0, 5).map((r) => r.item),
          itemContext: { bankTransactionId: bankTx?.id, concept: bankTx?.concept, counterpartName: bankTx?.counterpartName },
        });
      }
    }

    if (!contact) {
      return NextResponse.json({
        status: "CONTACT_NEEDED",
        suggestions: [],
        itemContext: {
          bankTransactionId: bankTx?.id,
          invoiceId: invoice?.id,
          concept: bankTx?.concept,
          counterpartName: bankTx?.counterpartName,
          counterpartIban: bankTx?.counterpartIban,
        },
      });
    }

    // 3. Resolve email
    const recipientEmail = contact.accountingEmail ?? contact.email ?? data.email;
    if (!recipientEmail) {
      // Save manual email if provided
      if (data.email) {
        await db.contact.update({ where: { id: contact.id }, data: { accountingEmail: data.email } });
      } else {
        return NextResponse.json({
          status: "EMAIL_NEEDED",
          contact: { id: contact.id, name: contact.name, cif: contact.cif },
          itemContext: { bankTransactionId: bankTx?.id, invoiceId: invoice?.id },
        });
      }
    }

    const finalEmail = recipientEmail ?? data.email!;

    // 4. Draft email via AI
    const draft = await draftInquiryEmail({
      trigger: data.triggerType,
      bankTransaction: bankTx ? {
        amount: bankTx.amount,
        valueDate: bankTx.valueDate.toISOString().slice(0, 10),
        concept: bankTx.concept ?? "",
        counterpartName: bankTx.counterpartName ?? undefined,
      } : undefined,
      invoice: invoice ? {
        number: invoice.number,
        date: invoice.issueDate.toISOString().slice(0, 10),
        amount: invoice.totalAmount,
        description: invoice.description ?? undefined,
      } : undefined,
      contact: {
        name: contact.name,
        accountingContact: contact.accountingContact ?? undefined,
        preferredLanguage: contact.preferredLanguage ?? undefined,
      },
      company: { name: ctx.company.name },
      followUpNumber: 0,
      tone: data.tone as any,
    });

    // 5. Create Inquiry with DRAFT status
    const inquiry = await (db.inquiry as any).create({
      data: {
        triggerType: data.triggerType,
        bankTransactionId: bankTx?.id,
        reconciliationId: bankTx?.reconciliations?.[0]?.id,
        invoiceId: invoice?.id,
        contactId: contact.id,
        recipientEmail: finalEmail,
        recipientName: contact.accountingContact ?? contact.name,
        subject: draft.subject,
        body: draft.htmlBody,
        bodyPlain: draft.plainBody,
        tone: data.tone,
        status: "DRAFT",
      },
      include: {
        contact: { select: { id: true, name: true, email: true, accountingEmail: true } },
        bankTransaction: { select: { id: true, amount: true, concept: true, valueDate: true } },
      },
    });

    return NextResponse.json({ status: "DRAFT_READY", inquiry });
  } catch (err) {
    return errorResponse("Failed to generate inquiry", err);
  }
});
