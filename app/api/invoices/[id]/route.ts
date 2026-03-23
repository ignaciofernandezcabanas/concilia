import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";

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
    }).catch((err) => console.warn("[[id]] Non-critical operation failed:", err instanceof Error ? err.message : err));

    return NextResponse.json({ success: true });
  },
  "delete:invoice"
);
