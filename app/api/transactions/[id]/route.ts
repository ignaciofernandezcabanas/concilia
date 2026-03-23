import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * DELETE /api/transactions/[id]
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    const tx = await db.bankTransaction.findFirst({
      where: { id, companyId: ctx.company.id },
    });
    if (!tx) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

    await db.bankTransaction.delete({ where: { id } });

    createAuditLog(db, {
      userId: ctx.user.id,
      action: "TRANSACTION_DELETED",
      entityType: "BankTransaction",
      entityId: id,
      details: { concept: tx.concept, amount: tx.amount },
    }).catch((err) => console.warn("[[id]] Non-critical operation failed:", err instanceof Error ? err.message : err));

    return NextResponse.json({ success: true });
  },
  "delete:transaction"
);
