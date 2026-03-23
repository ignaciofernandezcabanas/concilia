/**
 * Storage factory.
 *
 * Returns the appropriate storage or email provider based on the integration type.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { decryptJson } from "@/lib/crypto";
import { GoogleDriveProvider } from "./google-drive";
import { OneDriveProvider } from "./onedrive";
import type { StorageProvider, EmailProvider } from "./types";

export type { StorageProvider, StorageFile, StorageFolder, UploadOptions } from "./types";
export type { EmailProvider, EmailMessage, EmailAttachment } from "./types";

/**
 * Gets the storage provider for a company based on its active integration.
 * Returns null if no storage integration is configured.
 */
export async function getStorageProvider(
  db: ScopedPrisma
): Promise<StorageProvider | null> {
  // Check for Google Drive integration
  const driveIntegration = await db.integration.findFirst({
    where: {
      type: "GOOGLE_DRIVE",
      status: "CONNECTED",
    },
    select: { config: true },
  });

  if (driveIntegration?.config) {
    const creds = decryptJson<{ access_token: string }>(String(driveIntegration.config));
    return new GoogleDriveProvider(creds.access_token);
  }

  // Check for OneDrive integration
  const onedriveIntegration = await db.integration.findFirst({
    where: {
      type: "ONEDRIVE",
      status: "CONNECTED",
    },
    select: { config: true },
  });

  if (onedriveIntegration?.config) {
    const creds = decryptJson<{ access_token: string }>(String(onedriveIntegration.config));
    return new OneDriveProvider(creds.access_token);
  }

  return null;
}

/**
 * Gets the email provider for a company's invoice mailbox.
 * Looks for GMAIL or OUTLOOK integration with status CONNECTED.
 */
export async function getEmailProvider(
  db: ScopedPrisma
): Promise<EmailProvider | null> {
  const gmailIntegration = await db.integration.findFirst({
    where: { type: "GMAIL", status: "CONNECTED" },
    select: { config: true },
  });

  if (gmailIntegration?.config) {
    const creds = decryptJson<{ access_token: string }>(String(gmailIntegration.config));
    // Minimal Gmail EmailProvider implementation
    return createGmailEmailProvider(creds.access_token);
  }

  const outlookIntegration = await db.integration.findFirst({
    where: { type: "OUTLOOK", status: "CONNECTED" },
    select: { config: true },
  });

  if (outlookIntegration?.config) {
    const creds = decryptJson<{ access_token: string }>(String(outlookIntegration.config));
    return createOutlookEmailProvider(creds.access_token);
  }

  return null;
}

function createGmailEmailProvider(accessToken: string): EmailProvider {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

  return {
    name: "gmail",
    async searchMessages(query: string, maxResults = 50) {
      const res = await fetch(`${BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      const ids: string[] = (data.messages ?? []).map((m: { id: string }) => m.id);
      const messages = [];
      for (const id of ids.slice(0, maxResults)) {
        try { messages.push(await this.getMessage(id)); } catch { /* skip */ }
      }
      return messages;
    },
    async getMessage(messageId: string) {
      const res = await fetch(`${BASE}/messages/${messageId}?format=full`, { headers });
      const data = await res.json();
      const hdrs = data.payload?.headers ?? [];
      const getHdr = (name: string) => hdrs.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      const attachments = (data.payload?.parts ?? [])
        .filter((p: { filename: string; body?: { attachmentId?: string } }) => p.filename && p.body?.attachmentId)
        .map((p: { filename: string; mimeType: string; body: { size: number; attachmentId: string } }) => ({
          id: p.body.attachmentId, fileName: p.filename, mimeType: p.mimeType, size: p.body.size,
        }));
      return {
        id: messageId, from: getHdr("From"), to: [getHdr("To")],
        subject: getHdr("Subject"), date: getHdr("Date"), snippet: data.snippet ?? "",
        hasAttachments: attachments.length > 0, attachments,
      };
    },
    async downloadAttachment(messageId: string, attachmentId: string) {
      const res = await fetch(`${BASE}/messages/${messageId}/attachments/${attachmentId}`, { headers });
      const data = await res.json();
      return Buffer.from(data.data, "base64url");
    },
    async markAsRead(messageId: string) {
      await fetch(`${BASE}/messages/${messageId}/modify`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      });
    },
    async sendMessage(params) {
      // Build MIME message
      const boundary = `boundary_${Date.now()}`;
      const replyHeaders = params.replyToMessageId
        ? `In-Reply-To: ${params.replyToMessageId}\r\nReferences: ${params.replyToMessageId}\r\n`
        : "";
      const raw = [
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        `${replyHeaders}MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        params.plainBody,
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        params.htmlBody,
        `--${boundary}--`,
      ].join("\r\n");
      const encoded = Buffer.from(raw).toString("base64url");
      const body: Record<string, string> = { raw: encoded };
      if (params.threadId) body.threadId = params.threadId;
      const res = await fetch(`${BASE}/messages/send`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return { messageId: data.id ?? "", threadId: data.threadId ?? "" };
    },
  };
}

function createOutlookEmailProvider(accessToken: string): EmailProvider {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const BASE = "https://graph.microsoft.com/v1.0/me";

  return {
    name: "outlook",
    async searchMessages(query: string, maxResults = 50) {
      const filter = query.includes("unread") ? "$filter=isRead eq false" : `$search="${query}"`;
      const res = await fetch(`${BASE}/messages?${filter}&$top=${maxResults}&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,hasAttachments`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      const messages = [];
      for (const m of data.value ?? []) {
        if (m.hasAttachments) {
          try { messages.push(await this.getMessage(m.id)); } catch { /* skip */ }
        }
      }
      return messages;
    },
    async getMessage(messageId: string) {
      const [msgRes, attRes] = await Promise.all([
        fetch(`${BASE}/messages/${messageId}`, { headers }),
        fetch(`${BASE}/messages/${messageId}/attachments`, { headers }),
      ]);
      const msg = await msgRes.json();
      const att = await attRes.json();
      const attachments = (att.value ?? []).map((a: { id: string; name: string; contentType: string; size: number }) => ({
        id: a.id, fileName: a.name, mimeType: a.contentType, size: a.size,
      }));
      return {
        id: messageId, from: msg.from?.emailAddress?.address ?? "",
        to: (msg.toRecipients ?? []).map((r: { emailAddress: { address: string } }) => r.emailAddress.address),
        subject: msg.subject ?? "", date: msg.receivedDateTime ?? "",
        snippet: msg.bodyPreview ?? "", hasAttachments: attachments.length > 0, attachments,
      };
    },
    async downloadAttachment(messageId: string, attachmentId: string) {
      const res = await fetch(`${BASE}/messages/${messageId}/attachments/${attachmentId}`, { headers });
      const data = await res.json();
      return Buffer.from(data.contentBytes, "base64");
    },
    async markAsRead(messageId: string) {
      await fetch(`${BASE}/messages/${messageId}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
    },
    async sendMessage(params) {
      if (params.replyToMessageId) {
        // Reply to existing message
        const res = await fetch(`${BASE}/messages/${params.replyToMessageId}/reply`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: { toRecipients: [{ emailAddress: { address: params.to } }] },
            comment: params.htmlBody,
          }),
        });
        const data = await res.json();
        return { messageId: data.id ?? "", threadId: data.conversationId ?? "" };
      }
      // New message
      const res = await fetch(`${BASE}/sendMail`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: params.subject,
            body: { contentType: "HTML", content: params.htmlBody },
            toRecipients: [{ emailAddress: { address: params.to } }],
          },
        }),
      });
      // sendMail returns 202 with no body, get sent message from sentItems
      if (res.status === 202) {
        return { messageId: `outlook_${Date.now()}`, threadId: "" };
      }
      const data = await res.json();
      return { messageId: data.id ?? "", threadId: data.conversationId ?? "" };
    },
  };
}
