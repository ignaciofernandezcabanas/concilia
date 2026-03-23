/**
 * Email Response Monitor for Inquiries.
 *
 * Checks the company's email inbox for responses to open inquiries.
 * Parses responses with AI, imports attachments, and updates inquiry status.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { getEmailProvider } from "@/lib/storage";
import { callAIJson } from "@/lib/ai/model-router";
import { ANALYZE_INQUIRY_RESPONSE } from "@/lib/ai/prompt-registry";
import { draftInquiryEmail } from "@/lib/ai/inquiry-drafter";
import type { InquiryTone } from "@prisma/client";

export interface MonitorResult {
  responsesFound: number;
  resolved: number;
  followUpsGenerated: number;
  escalated: number;
  errors: string[];
}

export async function checkInquiryResponses(
  db: ScopedPrisma,
  companyId: string
): Promise<MonitorResult> {
  const result: MonitorResult = {
    responsesFound: 0, resolved: 0, followUpsGenerated: 0, escalated: 0, errors: [],
  };

  const provider = await getEmailProvider(db);
  if (!provider) return result;

  // Get all SENT inquiries awaiting response
  const sentInquiries = await db.inquiry.findMany({
    where: { status: "SENT" },
    include: {
      contact: { select: { name: true, accountingContact: true, preferredLanguage: true } },
    },
  });

  for (const inquiry of sentInquiries) {
    try {
      // Search for replies by thread or sender
      let responses;
      if (inquiry.sentThreadId) {
        responses = await provider.searchMessages(
          `thread:${inquiry.sentThreadId} from:${inquiry.recipientEmail}`,
          5
        );
      } else {
        responses = await provider.searchMessages(
          `from:${inquiry.recipientEmail} subject:"${inquiry.subject.slice(0, 50)}"`,
          5
        );
      }

      // Filter to messages after sent date
      const newResponses = responses.filter(
        (msg) => inquiry.sentAt && new Date(msg.date) > inquiry.sentAt
      );

      if (newResponses.length === 0) continue;

      const latestResponse = newResponses[0];
      result.responsesFound++;

      // Analyze response with AI
      const analysis = await callAIJson(
        "analyze_inquiry_response",
        ANALYZE_INQUIRY_RESPONSE.system,
        ANALYZE_INQUIRY_RESPONSE.buildUser({
          originalSubject: inquiry.subject,
          originalTrigger: inquiry.triggerType,
          responseText: latestResponse.snippet ?? "",
          hasAttachments: latestResponse.hasAttachments,
          attachmentNames: latestResponse.attachments.map((a) => a.fileName),
        }),
        ANALYZE_INQUIRY_RESPONSE.schema
      );

      // Update inquiry with response data
      await db.inquiry.update({
        where: { id: inquiry.id },
        data: {
          status: analysis?.resolved ? "RESOLVED" : "FOLLOW_UP_NEEDED",
          responseReceivedAt: new Date(),
          responseMessageId: latestResponse.id,
          responseSummary: analysis?.summary ?? "Respuesta recibida",
          responseResolved: analysis?.resolved ?? false,
          attachmentsReceived: latestResponse.attachments.length,
        },
      });

      if (analysis?.resolved) {
        result.resolved++;
        // Create notification
        // Notification created via daily agent briefing
      }
    } catch (err) {
      result.errors.push(`Inquiry ${inquiry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Check for overdue follow-ups
  const now = new Date();
  const dueForFollowUp = await db.inquiry.findMany({
    where: {
      status: "SENT",
      nextFollowUpDate: { lte: now },
      responseReceivedAt: null,
    },
    include: {
      contact: { select: { name: true, accountingContact: true, preferredLanguage: true } },
    },
  });

  for (const inquiry of dueForFollowUp) {
    try {
      if (inquiry.followUpNumber >= inquiry.maxFollowUps) {
        // Escalate
        await db.inquiry.update({
          where: { id: inquiry.id },
          data: { status: "ESCALATED" },
        });
        // Escalation notification via daily agent briefing
        result.escalated++;
      } else {
        // Generate follow-up draft
        const company = await db.company.findFirst({ select: { name: true } });
        const draft = await draftInquiryEmail({
          trigger: inquiry.triggerType as any,
          contact: {
            name: inquiry.contact.name,
            accountingContact: inquiry.contact.accountingContact ?? undefined,
            preferredLanguage: inquiry.contact.preferredLanguage ?? undefined,
          },
          company: { name: company?.name ?? "" },
          followUpNumber: inquiry.followUpNumber + 1,
          previousSubject: inquiry.subject,
          tone: inquiry.tone as InquiryTone,
        });

        await (db.inquiry as any).create({
          data: {
            triggerType: inquiry.triggerType,
            bankTransactionId: inquiry.bankTransactionId,
            reconciliationId: inquiry.reconciliationId,
            invoiceId: inquiry.invoiceId,
            contactId: inquiry.contactId,
            recipientEmail: inquiry.recipientEmail,
            recipientName: inquiry.recipientName,
            subject: draft.subject,
            body: draft.htmlBody,
            bodyPlain: draft.plainBody,
            tone: inquiry.tone,
            language: inquiry.language,
            status: "FOLLOW_UP_DRAFT",
            parentInquiryId: inquiry.id,
            followUpNumber: inquiry.followUpNumber + 1,
            maxFollowUps: inquiry.maxFollowUps,
            sentThreadId: inquiry.sentThreadId,
          },
        });

        // Follow-up notification via daily agent briefing
        result.followUpsGenerated++;
      }
    } catch (err) {
      result.errors.push(`Follow-up for ${inquiry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
