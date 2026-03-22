import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * DELETE /api/invoices/[id]
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: ctx.company.id },
    });
    if (!invoice) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

    await prisma.invoice.delete({ where: { id } });

    createAuditLog({
      userId: ctx.user.id,
      action: "INVOICE_DELETED",
      entityType: "Invoice",
      entityId: id,
      details: { number: invoice.number },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  },
  "delete:invoice"
);
