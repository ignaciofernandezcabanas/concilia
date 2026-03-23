/**
 * Email Response Monitor for Inquiries.
 *
 * v2: Uses the full response evaluator (3-phase: attachments, text, action decision)
 * instead of the simple ANALYZE_INQUIRY_RESPONSE prompt.
 *
 * Closes the loop: detect response → evaluate → execute action → notify.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { getEmailProvider } from "@/lib/storage";
import { evaluateResponse } from "@/lib/email/response-evaluator";
import { draftReplyEmail } from "@/lib/ai/inquiry-replier";
import { draftInquiryEmail } from "@/lib/ai/inquiry-drafter";
import type { InquiryTone, ProposedAction } from "@prisma/client";

export interface MonitorResult {
  responsesFound: number;
  resolved: number;
  followUpsGenerated: number;
  escalated: number;
  repliesDrafted: number;
  errors: string[];
}

export async function checkInquiryResponses(
  db: ScopedPrisma,
  companyId: string
): Promise<MonitorResult> {
  const result: MonitorResult = {
    responsesFound: 0, resolved: 0, followUpsGenerated: 0,
    escalated: 0, repliesDrafted: 0, errors: [],
  };

  const provider = await getEmailProvider(db);
  if (!provider) return result;

  // ── Phase A: Process responses to SENT inquiries ──

  const sentInquiries = await db.inquiry.findMany({
    where: { status: "SENT" },
    include: {
      contact: { select: { id: true, name: true, cif: true, accountingContact: true, preferredLanguage: true } },
      bankTransaction: { select: { id: true, amount: true, valueDate: true, concept: true } },
      invoice: { select: { id: true, number: true, totalAmount: true, issueDate: true } },
    },
  });

  for (const inquiry of sentInquiries) {
    try {
      // Search for replies
      let responses;
      if (inquiry.sentThreadId) {
        responses = await provider.searchMessages(
          `thread:${inquiry.sentThreadId} from:${inquiry.recipientEmail}`, 5
        );
      } else {
        responses = await provider.searchMessages(
          `from:${inquiry.recipientEmail} subject:"${inquiry.subject.slice(0, 50)}"`, 5
        );
      }

      const newResponses = responses.filter(
        (msg) => inquiry.sentAt && new Date(msg.date) > inquiry.sentAt
      );
      if (newResponses.length === 0) continue;

      const latestResponse = newResponses[0];
      result.responsesFound++;

      // Download attachments for PDF analysis
      const attachmentsWithContent = await Promise.all(
        latestResponse.attachments
          .filter((a) => a.mimeType.includes("pdf") || a.mimeType.includes("image"))
          .map(async (a) => {
            try {
              const content = await provider.downloadAttachment(latestResponse.id, a.id);
              return { filename: a.fileName, mimeType: a.mimeType, size: a.size, content };
            } catch {
              return { filename: a.fileName, mimeType: a.mimeType, size: a.size };
            }
          })
      );

      // Run full 3-phase evaluation
      const evaluation = await evaluateResponse({
        inquiry: {
          triggerType: inquiry.triggerType as any,
          subject: inquiry.subject,
          contactId: inquiry.contactId,
        },
        responseEmail: {
          from: latestResponse.from,
          subject: latestResponse.subject,
          body: latestResponse.snippet ?? "",
          attachments: attachmentsWithContent,
        },
        originalRequest: {
          triggerType: inquiry.triggerType as any,
          bankTransaction: inquiry.bankTransaction ? {
            amount: inquiry.bankTransaction.amount,
            valueDate: inquiry.bankTransaction.valueDate.toISOString().slice(0, 10),
            concept: inquiry.bankTransaction.concept ?? "",
          } : undefined,
          invoice: inquiry.invoice ? {
            number: inquiry.invoice.number,
            amount: inquiry.invoice.totalAmount,
            date: inquiry.invoice.issueDate.toISOString().slice(0, 10),
          } : undefined,
          contactName: inquiry.contact.name,
          contactCif: inquiry.contact.cif ?? undefined,
        },
      });

      // Save evaluation to inquiry
      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: {
          status: "RESPONSE_RECEIVED",
          responseReceivedAt: new Date(),
          responseMessageId: latestResponse.id,
          responseSummary: evaluation.textAnalysis.summary,
          responseResolved: evaluation.proposedAction === "CLOSE_RESOLVED",
          responseType: evaluation.responseType,
          responseConfidence: evaluation.confidence,
          attachmentsReceived: latestResponse.attachments.length,
          documentValidation: evaluation.documentValidation ?? undefined,
          proposedAction: evaluation.proposedAction,
          proposedActionReason: evaluation.proposedActionReason,
        },
      });

      // Execute action
      await executeAction(db, inquiry, evaluation, result);

    } catch (err) {
      result.errors.push(`Inquiry ${inquiry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Phase B: Generate follow-ups for overdue inquiries ──

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
        await (db.inquiry as any).update({
          where: { id: inquiry.id },
          data: { status: "ESCALATED" },
        });
        result.escalated++;
      } else {
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
        result.followUpsGenerated++;
      }
    } catch (err) {
      result.errors.push(`Follow-up ${inquiry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ── Action executor ──

async function executeAction(
  db: ScopedPrisma,
  inquiry: any,
  evaluation: Awaited<ReturnType<typeof evaluateResponse>>,
  result: MonitorResult
): Promise<void> {
  const action = evaluation.proposedAction as ProposedAction;

  switch (action) {
    case "CLOSE_RESOLVED":
    case "CLOSE_WITH_NOTE": {
      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: { status: "RESOLVED" },
      });
      result.resolved++;
      break;
    }

    case "REPLY_REQUEST_DOCUMENT":
    case "REPLY_REQUEST_CORRECT":
    case "REPLY_CLARIFY": {
      const company = await db.company.findFirst({ select: { name: true } });
      const replyDraft = await draftReplyEmail({
        inquiry: {
          subject: inquiry.subject,
          triggerType: inquiry.triggerType,
          recipientName: inquiry.recipientName,
          followUpNumber: inquiry.followUpNumber,
          tone: inquiry.tone,
        },
        evaluation,
        proposedAction: action,
        bankTransaction: inquiry.bankTransaction ?? undefined,
        companyName: company?.name ?? "",
      });

      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: { status: "FOLLOW_UP_NEEDED", proposedFollowUpBody: replyDraft.htmlBody },
      });

      await (db.inquiry as any).create({
        data: {
          triggerType: inquiry.triggerType,
          bankTransactionId: inquiry.bankTransactionId,
          invoiceId: inquiry.invoiceId,
          contactId: inquiry.contactId,
          recipientEmail: inquiry.recipientEmail,
          recipientName: inquiry.recipientName,
          subject: `Re: ${inquiry.subject}`,
          body: replyDraft.htmlBody,
          bodyPlain: replyDraft.plainBody,
          tone: inquiry.tone,
          language: inquiry.language,
          status: "FOLLOW_UP_DRAFT",
          parentInquiryId: inquiry.id,
          followUpNumber: inquiry.followUpNumber + 1,
          sentThreadId: inquiry.sentThreadId,
        },
      });
      result.repliesDrafted++;
      break;
    }

    case "REPLY_REDIRECT": {
      const redirectEmail = evaluation.textAnalysis.redirectContact?.email;
      if (redirectEmail) {
        let newContact = await db.contact.findFirst({ where: { email: redirectEmail } });
        if (!newContact) {
          newContact = await (db.contact as any).create({
            data: {
              name: evaluation.textAnalysis.redirectContact?.name ?? redirectEmail,
              email: redirectEmail,
              type: "SUPPLIER",
            },
          });
        }

        if (!newContact) break;
        const company = await db.company.findFirst({ select: { name: true } });
        const redirectDraft = await draftReplyEmail({
          inquiry: {
            subject: inquiry.subject,
            triggerType: inquiry.triggerType,
            recipientName: newContact.name,
            followUpNumber: 0,
            tone: inquiry.tone,
          },
          evaluation,
          proposedAction: action,
          bankTransaction: inquiry.bankTransaction ?? undefined,
          companyName: company?.name ?? "",
        });

        await (db.inquiry as any).create({
          data: {
            triggerType: inquiry.triggerType,
            bankTransactionId: inquiry.bankTransactionId,
            contactId: newContact.id,
            recipientEmail: redirectEmail,
            recipientName: newContact.name,
            subject: inquiry.subject,
            body: redirectDraft.htmlBody,
            bodyPlain: redirectDraft.plainBody,
            status: "DRAFT",
            parentInquiryId: inquiry.id,
          },
        });
      }
      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: { status: "FOLLOW_UP_NEEDED" },
      });
      result.repliesDrafted++;
      break;
    }

    case "WAIT_PROMISED": {
      const waitDays = evaluation.waitUntilDate ? 0 : 3;
      const waitUntil = evaluation.waitUntilDate
        ? new Date(evaluation.waitUntilDate)
        : new Date(Date.now() + waitDays * 86400000);

      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: {
          status: "SENT", // back to waiting
          nextFollowUpDate: waitUntil,
          responseSummary: evaluation.textAnalysis.summary,
        },
      });
      break;
    }

    case "ESCALATE_CONTROLLER":
    case "ESCALATE_DISPUTE": {
      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: { status: "ESCALATED" },
      });
      result.escalated++;
      break;
    }

    case "FOLLOW_UP_STANDARD":
    default: {
      await (db.inquiry as any).update({
        where: { id: inquiry.id },
        data: { status: "FOLLOW_UP_NEEDED" },
      });
      break;
    }
  }
}

// ── Inquiry metrics for briefing ──

export interface InquiryMetrics {
  totalOpen: number;
  awaitingResponse: number;
  awaitingApproval: number;
  escalated: number;
  resolvedLast30d: number;
  sentLast30d: number;
  resolutionRate: number;
  autoResolutionRate: number;
  avgResponseTimeDays: number;
}

export async function getInquiryMetrics(db: ScopedPrisma): Promise<InquiryMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [totalOpen, awaitingResponse, awaitingApproval, escalated, resolvedLast30d, sentLast30d, autoResolved] =
    await Promise.all([
      db.inquiry.count({ where: { status: { notIn: ["RESOLVED", "CANCELLED", "EXPIRED"] } } }),
      db.inquiry.count({ where: { status: "SENT" } }),
      db.inquiry.count({ where: { status: { in: ["DRAFT", "FOLLOW_UP_DRAFT"] } } }),
      db.inquiry.count({ where: { status: "ESCALATED" } }),
      db.inquiry.count({ where: { status: "RESOLVED", responseReceivedAt: { gte: thirtyDaysAgo } } }),
      db.inquiry.count({ where: { sentAt: { gte: thirtyDaysAgo } } }),
      db.inquiry.count({ where: { status: "RESOLVED", proposedAction: "CLOSE_RESOLVED", responseReceivedAt: { gte: thirtyDaysAgo } } }),
    ]);

  const resolutionRate = sentLast30d > 0 ? Math.round((resolvedLast30d / sentLast30d) * 100) : 0;
  const autoResolutionRate = resolvedLast30d > 0 ? Math.round((autoResolved / resolvedLast30d) * 100) : 0;

  // Avg response time: resolved inquiries with sentAt and responseReceivedAt
  const resolvedWithTimes = await db.inquiry.findMany({
    where: { status: "RESOLVED", sentAt: { not: null }, responseReceivedAt: { not: null } },
    select: { sentAt: true, responseReceivedAt: true },
    take: 50,
    orderBy: { responseReceivedAt: "desc" },
  });

  let avgResponseTimeDays = 0;
  if (resolvedWithTimes.length > 0) {
    const totalDays = resolvedWithTimes.reduce((sum, inq) => {
      if (!inq.sentAt || !inq.responseReceivedAt) return sum;
      return sum + (inq.responseReceivedAt.getTime() - inq.sentAt.getTime()) / 86400000;
    }, 0);
    avgResponseTimeDays = Math.round((totalDays / resolvedWithTimes.length) * 10) / 10;
  }

  return {
    totalOpen, awaitingResponse, awaitingApproval, escalated,
    resolvedLast30d, sentLast30d, resolutionRate, autoResolutionRate, avgResponseTimeDays,
  };
}
