/**
 * Gmail API client — READ-ONLY.
 *
 * Used exclusively to:
 * - Search for emails containing invoices (PDF/image attachments)
 * - Download attachments to import into Concilia
 *
 * This client NEVER sends emails.
 */

import { google, type gmail_v1 } from "googleapis";

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  attachments: AttachmentMeta[];
}

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

/** MIME types we consider as potential invoices */
const INVOICE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "application/xml",
  "text/xml",
]);

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(config: GmailConfig) {
    const oauth2 = new google.auth.OAuth2(config.clientId, config.clientSecret);
    oauth2.setCredentials({ refresh_token: config.refreshToken });
    this.gmail = google.gmail({ version: "v1", auth: oauth2 });
  }

  /**
   * Search for emails that likely contain invoices.
   * Default query targets: PDFs, from common invoice senders, with attachment.
   */
  async searchInvoiceEmails(query?: string, maxResults = 30): Promise<ReceivedEmail[]> {
    const defaultQuery = "has:attachment (filename:pdf OR filename:xml) newer_than:30d";
    const q = query || defaultQuery;

    const res = await this.gmail.users.messages.list({
      userId: "me",
      q,
      maxResults,
    });

    if (!res.data.messages?.length) return [];

    const emails: ReceivedEmail[] = [];

    for (const msg of res.data.messages) {
      try {
        const detail = await this.gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
        });

        const headers = detail.data.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

        // Collect invoice-like attachments from all parts (including nested)
        const attachments: AttachmentMeta[] = [];
        collectAttachments(detail.data.payload, attachments);

        // Skip emails without relevant attachments
        if (attachments.length === 0) continue;

        emails.push({
          id: msg.id!,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: detail.data.snippet ?? "",
          attachments,
        });
      } catch {
        // Skip individual email errors
        continue;
      }
    }

    return emails;
  }

  /**
   * Download an attachment by message ID and attachment ID.
   * Returns the raw file content as a Buffer.
   */
  async downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const res = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = res.data.data ?? "";
    // Gmail returns URL-safe base64
    return Buffer.from(data, "base64");
  }

  /**
   * Verify connection by getting the user's email address.
   */
  async getProfile(): Promise<{ email: string }> {
    const res = await this.gmail.users.getProfile({ userId: "me" });
    return { email: res.data.emailAddress ?? "" };
  }
}

/**
 * Recursively collect invoice-like attachments from MIME parts.
 */
function collectAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: AttachmentMeta[]
): void {
  if (!part) return;

  if (part.filename && part.body?.attachmentId && part.mimeType) {
    if (INVOICE_MIME_TYPES.has(part.mimeType)) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size ?? 0,
      });
    }
  }

  if (part.parts) {
    for (const child of part.parts) {
      collectAttachments(child, out);
    }
  }
}
