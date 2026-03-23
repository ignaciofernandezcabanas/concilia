/**
 * Unified email sender.
 * Detects whether Gmail or Outlook is configured and sends via the appropriate provider.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { getEmailProvider } from "@/lib/storage";
import type { SendMessageResult } from "@/lib/storage/types";

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  plainBody: string;
  replyToMessageId?: string;
  threadId?: string;
}

export async function sendEmail(
  db: ScopedPrisma,
  params: SendEmailParams
): Promise<SendMessageResult> {
  const provider = await getEmailProvider(db);
  if (!provider) {
    throw new Error("No email provider configured. Connect Gmail or Outlook in settings.");
  }

  return provider.sendMessage({
    to: params.to,
    subject: params.subject,
    htmlBody: params.htmlBody,
    plainBody: params.plainBody,
    replyToMessageId: params.replyToMessageId,
    threadId: params.threadId,
  });
}

/**
 * Check if the configured email provider supports sending.
 * Returns true if a provider is connected (scope check is provider-side).
 */
export async function canSendEmail(db: ScopedPrisma): Promise<boolean> {
  const provider = await getEmailProvider(db);
  return provider !== null;
}
