import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().optional(),
});

/**
 * POST /api/inquiries/[id]/reject — Reject draft
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const body = await req.json().catch(() => ({}));
      const parsed = rejectSchema.safeParse(body);

      const inquiry = await db.inquiry.findUnique({ where: { id } });
      if (!inquiry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!["DRAFT", "FOLLOW_UP_DRAFT"].includes(inquiry.status)) {
        return NextResponse.json({ error: "Can only reject drafts" }, { status: 400 });
      }

      await db.inquiry.update({
        where: { id },
        data: {
          status: "CANCELLED",
          rejectedAt: new Date(),
          rejectionReason: parsed.success ? parsed.data.reason : undefined,
        },
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse("Failed to reject inquiry", err);
    }
  }
);
