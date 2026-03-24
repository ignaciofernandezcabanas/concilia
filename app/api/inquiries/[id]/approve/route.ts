import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createAuditLog } from "@/lib/utils/audit";
import { sendEmail } from "@/lib/email/sender";

/**
 * POST /api/inquiries/[id]/approve — Approve and send
 */
export const POST = withAuth(
  async (_req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const inquiry = await db.inquiry.findUnique({ where: { id } });
      if (!inquiry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!["DRAFT", "FOLLOW_UP_DRAFT"].includes(inquiry.status)) {
        return NextResponse.json({ error: "Can only approve drafts" }, { status: 400 });
      }

      // Send email
      const sendResult = await sendEmail(db, {
        to: inquiry.recipientEmail,
        subject: inquiry.subject,
        htmlBody: inquiry.body,
        plainBody: inquiry.bodyPlain,
        replyToMessageId: inquiry.parentInquiryId
          ? ((
              await db.inquiry.findUnique({
                where: { id: inquiry.parentInquiryId },
                select: { sentMessageId: true },
              })
            )?.sentMessageId ?? undefined)
          : undefined,
        threadId: inquiry.sentThreadId ?? undefined,
      });

      // Calculate next follow-up date (escalating: 3 → 5 → 7 days)
      const intervalDays = Math.min(3 + inquiry.followUpNumber * 2, 7);
      const nextFollowUp = new Date();
      nextFollowUp.setDate(nextFollowUp.getDate() + intervalDays);

      // Update inquiry
      const updated = await db.inquiry.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          sentMessageId: sendResult.messageId,
          sentThreadId: sendResult.threadId || inquiry.sentThreadId,
          approvedById: ctx.user.id,
          approvedAt: new Date(),
          nextFollowUpDate: nextFollowUp,
          followUpIntervalDays: intervalDays,
        },
      });

      await createAuditLog(db, {
        userId: ctx.user.id,
        action: "APPROVE_INQUIRY",
        entityType: "inquiry",
        entityId: id,
        details: { recipientEmail: inquiry.recipientEmail, followUpNumber: inquiry.followUpNumber },
      });

      return NextResponse.json(updated);
    } catch (err) {
      return errorResponse("Failed to approve and send inquiry", err);
    }
  }
);
