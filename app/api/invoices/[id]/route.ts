import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * GET /api/invoices/[id] — Invoice detail with lines and contact
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

      const invoice = await db.invoice.findUnique({
        where: { id },
        include: {
          contact: { select: { name: true, cif: true, email: true } },
          lines: true,
        },
      });

      if (!invoice) return NextResponse.json({ error: "Not found." }, { status: 404 });
      return NextResponse.json(invoice);
    } catch (err) {
      return errorResponse("Failed to get invoice", err);
    }
  }
);

/**
 * DELETE /api/invoices/[id]
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const invoice = await db.invoice.findFirst({
      where: { id, companyId: ctx.company.id },
    });
    if (!invoice) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

    await db.invoice.delete({ where: { id } });

    createAuditLog(db, {
      userId: ctx.user.id,
      action: "INVOICE_DELETED",
      entityType: "Invoice",
      entityId: id,
      details: { number: invoice.number },
    }).catch((err) =>
      console.warn(
        "[[id]] Non-critical operation failed:",
        err instanceof Error ? err.message : err
      )
    );

    return NextResponse.json({ success: true });
  },
  "delete:invoice"
);
