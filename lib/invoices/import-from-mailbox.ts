/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Import invoices from a dedicated email mailbox.
 *
 * Reads unread emails, downloads PDF attachments, extracts data with AI,
 * and creates invoices. Marks emails as read after processing.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { getEmailProvider } from "@/lib/storage";
import { extractInvoiceFromPdf } from "@/lib/invoices/pdf-extractor";

/**
 * Classify email attachments: invoice (operational) vs investment document.
 * Investment documents are NOT imported as invoices — they go to a separate flow.
 */
export function classifyEmailAttachment(
  subject: string,
  filename: string
): "INVOICE" | "INVESTMENT_DOCUMENT" | "UNKNOWN" {
  const text = `${subject} ${filename}`.toLowerCase();
  const investmentKeywords = [
    "escritura",
    "notaría",
    "notario",
    "spa",
    "share purchase",
    "compraventa acciones",
    "participaciones",
    "dividendo",
    "capital call",
    "llamada capital",
    "prestamo",
    "contrato prestamo",
  ];
  if (investmentKeywords.some((k) => text.includes(k))) return "INVESTMENT_DOCUMENT";

  const invoiceKeywords = ["factura", "fra", "invoice", "recibo", "albarán"];
  if (invoiceKeywords.some((k) => text.includes(k))) return "INVOICE";

  return "UNKNOWN";
}

export interface MailboxImportResult {
  emailsRead: number;
  attachmentsFound: number;
  invoicesImported: number;
  skipped: number;
  errors: Array<{ emailSubject: string; attachment: string; error: string }>;
}

export async function importInvoicesFromMailbox(
  db: ScopedPrisma,
  companyId: string
): Promise<MailboxImportResult> {
  const result: MailboxImportResult = {
    emailsRead: 0,
    attachmentsFound: 0,
    invoicesImported: 0,
    skipped: 0,
    errors: [],
  };

  const emailProvider = await getEmailProvider(db);
  if (!emailProvider) return result;

  // Fetch unread emails
  const query = emailProvider.name === "gmail" ? "is:unread" : "unread";
  const emails = await emailProvider.searchMessages(query, 100);
  result.emailsRead = emails.length;

  for (const email of emails) {
    // Filter PDF attachments only
    const pdfAttachments = email.attachments.filter(
      (a) => a.mimeType === "application/pdf" || a.fileName.toLowerCase().endsWith(".pdf")
    );

    for (const attachment of pdfAttachments) {
      result.attachmentsFound++;

      const holdedId = `mailbox:${email.id}:${attachment.id}`;

      // Dedup check
      const existing = await db.invoice.findFirst({
        where: { holdedId },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      try {
        // Download PDF
        const buffer = await emailProvider.downloadAttachment(email.id, attachment.id);

        // Extract data with AI
        const extracted = await extractInvoiceFromPdf(buffer, attachment.fileName);

        // Reject low confidence
        if ((extracted.confidence ?? 0) < 0.5) {
          result.errors.push({
            emailSubject: email.subject,
            attachment: attachment.fileName,
            error: `Low confidence: ${Math.round((extracted.confidence ?? 0) * 100)}%`,
          });
          continue;
        }

        // Upsert contact if we have supplier info
        let contactId: string | null = null;
        if (extracted.supplierName) {
          const contact = await (db as any).contact.upsert({
            where: {
              holdedId_companyId: {
                holdedId: `email:${extracted.supplierCif ?? extracted.supplierName}`,
                companyId,
              },
            },
            create: {
              holdedId: `email:${extracted.supplierCif ?? extracted.supplierName}`,
              name: extracted.supplierName,
              cif: extracted.supplierCif,
              type: extracted.type === "ISSUED" ? "CUSTOMER" : "SUPPLIER",
              companyId,
            },
            update: {
              name: extracted.supplierName,
              cif: extracted.supplierCif ?? undefined,
            },
          });
          contactId = contact.id;
        }

        // Create invoice
        await db.invoice.create({
          data: {
            holdedId,
            number: extracted.number ?? `MAIL-${email.id.slice(0, 8)}`,
            type: extracted.type === "ISSUED" ? "ISSUED" : "RECEIVED",
            issueDate: extracted.issueDate ? new Date(extracted.issueDate) : new Date(email.date),
            dueDate: extracted.dueDate ? new Date(extracted.dueDate) : null,
            totalAmount: extracted.totalAmount ?? 0,
            netAmount: extracted.netAmount ?? extracted.totalAmount ?? 0,
            vatAmount: extracted.vatAmount ?? 0,
            currency: extracted.currency ?? "EUR",
            description: extracted.description ?? email.subject,
            status: "PENDING",
            amountPaid: 0,
            amountPending: extracted.totalAmount ?? 0,
            contactId,
            companyId,
          } as any,
        });

        result.invoicesImported++;
      } catch (err) {
        result.errors.push({
          emailSubject: email.subject,
          attachment: attachment.fileName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Mark email as read AFTER processing all attachments
    try {
      await emailProvider.markAsRead(email.id);
    } catch (err) {
      console.warn("[mailbox] Failed to mark as read:", err instanceof Error ? err.message : err);
    }
  }

  return result;
}
