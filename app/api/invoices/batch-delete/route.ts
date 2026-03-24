import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Al menos un ID requerido"),
});

/**
 * POST /api/invoices/batch-delete
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "IDs requeridos." }, { status: 400 });

  const result = await db.invoice.deleteMany({
    where: { id: { in: parsed.data.ids }, companyId: ctx.company.id },
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: "INVOICES_BATCH_DELETED",
    entityType: "Invoice",
    entityId: "batch",
    details: { count: result.count, ids: parsed.data.ids },
  }).catch((err) =>
    console.warn(
      "[batch-delete] Non-critical operation failed:",
      err instanceof Error ? err.message : err
    )
  );

  return NextResponse.json({ success: true, deleted: result.count });
}, "delete:invoice");
