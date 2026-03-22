import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * DELETE /api/transactions/[id]
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const tx = await prisma.bankTransaction.findFirst({
      where: { id, companyId: ctx.company.id },
    });
    if (!tx) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

    await prisma.bankTransaction.delete({ where: { id } });

    createAuditLog({
      userId: ctx.user.id,
      action: "TRANSACTION_DELETED",
      entityType: "BankTransaction",
      entityId: id,
      details: { concept: tx.concept, amount: tx.amount },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  },
  "delete:transaction"
);
