/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * GET /api/invoices/[id]
 * Returns full invoice detail with lines, payments, and contact.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const id = req.nextUrl.pathname.split("/").pop()!;
    const db = ctx.db;

    const invoice = await (db as any).invoice.findUnique({
      where: { id },
      include: {
        lines: true,
        payments: {
          orderBy: { date: "desc" },
        },
        contact: {
          select: { id: true, name: true, cif: true, email: true, phone: true },
        },
        reconciliations: {
          where: { status: { in: ["PROPOSED", "AUTO_APPROVED", "APPROVED"] } },
          select: {
            id: true,
            status: true,
            confidenceScore: true,
            bankTransaction: {
              select: { id: true, concept: true, amount: true, valueDate: true },
            },
          },
          take: 5,
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (err) {
    return errorResponse("Failed to fetch invoice", err);
  }
}, "read:invoices");

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
