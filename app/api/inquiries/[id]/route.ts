import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

/**
 * GET /api/inquiries/[id] — Detail with follow-up chain
 */
export const GET = withAuth(async (
  _req: NextRequest, ctx: AuthContext,
  routeCtx?: { params?: Record<string, string> }
) => {
  const db = ctx.db;
  try {
    const id = routeCtx?.params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const inquiry = await db.inquiry.findUnique({
      where: { id },
      include: {
        contact: true,
        bankTransaction: { select: { id: true, amount: true, concept: true, valueDate: true, counterpartName: true, status: true } },
        invoice: { select: { id: true, number: true, totalAmount: true, type: true, status: true } },
        reconciliation: { select: { id: true, type: true, status: true } },
        parentInquiry: { select: { id: true, subject: true, body: true, sentAt: true, responseSummary: true } },
        followUps: { orderBy: { followUpNumber: "asc" }, select: { id: true, status: true, followUpNumber: true, subject: true, sentAt: true, responseSummary: true } },
      },
    });

    if (!inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    return NextResponse.json(inquiry);
  } catch (err) {
    return errorResponse("Failed to get inquiry", err);
  }
});

const updateSchema = z.object({
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  bodyPlain: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "FORMAL", "URGENT"]).optional(),
});

/**
 * PUT /api/inquiries/[id] — Edit draft
 */
export const PUT = withAuth(async (
  req: NextRequest, ctx: AuthContext,
  routeCtx?: { params?: Record<string, string> }
) => {
  const db = ctx.db;
  try {
    const id = routeCtx?.params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await db.inquiry.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["DRAFT", "FOLLOW_UP_DRAFT"].includes(existing.status)) {
      return NextResponse.json({ error: "Can only edit drafts" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const inquiry = await db.inquiry.update({
      where: { id },
      data: { ...parsed.data, editedByController: true },
    });

    return NextResponse.json(inquiry);
  } catch (err) {
    return errorResponse("Failed to update inquiry", err);
  }
});

/**
 * DELETE /api/inquiries/[id] — Cancel
 */
export const DELETE = withAuth(async (
  _req: NextRequest, ctx: AuthContext,
  routeCtx?: { params?: Record<string, string> }
) => {
  const db = ctx.db;
  try {
    const id = routeCtx?.params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await db.inquiry.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["DRAFT", "FOLLOW_UP_DRAFT"].includes(existing.status)) {
      return NextResponse.json({ error: "Can only cancel drafts" }, { status: 400 });
    }

    await db.inquiry.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse("Failed to cancel inquiry", err);
  }
});
