import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/journal-entries/[id] — post (DRAFT → POSTED) or reverse
 * Body: { action: "post" | "reverse" }
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID requerido." }, { status: 400 });

    const body = await req.json();
    const action = body.action as string;

    const entry = await db.journalEntry.findFirst({
      where: { id, companyId: ctx.company.id },
    });

    if (!entry) {
      return NextResponse.json({ error: "Asiento no encontrado." }, { status: 404 });
    }

    if (action === "post") {
      if (entry.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Solo se pueden contabilizar asientos en borrador." },
          { status: 400 }
        );
      }

      await db.journalEntry.update({
        where: { id },
        data: { status: "POSTED", postedAt: new Date(), postedById: ctx.user.id },
      });

      createAuditLog(db, {
        userId: ctx.user.id,
        action: "JOURNAL_ENTRY_POSTED",
        entityType: "JournalEntry",
        entityId: id,
        details: { number: entry.number },
      }).catch((err) =>
        console.warn("[journal] Non-critical:", err instanceof Error ? err.message : err)
      );

      return NextResponse.json({ success: true, status: "POSTED" });
    }

    if (action === "reverse") {
      if (entry.status !== "POSTED") {
        return NextResponse.json(
          { error: "Solo se pueden revertir asientos contabilizados." },
          { status: 400 }
        );
      }

      // Create reversal entry with swapped debit/credit
      const originalLines = await db.journalEntryLine.findMany({
        where: { journalEntryId: id },
      });

      const lastEntry = await db.journalEntry.findFirst({
        where: { companyId: ctx.company.id },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const nextNumber = (lastEntry?.number ?? 0) + 1;

      await db.$transaction([
        db.journalEntry.update({
          where: { id },
          data: { status: "REVERSED" },
        }),
        db.journalEntry.create({
          data: {
            number: nextNumber,
            date: new Date(),
            description: `Reversión de asiento #${entry.number}: ${entry.description}`,
            type: "ADJUSTMENT",
            status: "POSTED",
            reversalOfId: id,
            postedAt: new Date(),
            postedById: ctx.user.id,
            companyId: ctx.company.id,
            createdById: ctx.user.id,
            lines: {
              create: originalLines.map((l) => ({
                debit: l.credit,
                credit: l.debit,
                description: l.description,
                accountId: l.accountId,
              })),
            },
          },
        }),
      ]);

      createAuditLog(db, {
        userId: ctx.user.id,
        action: "JOURNAL_ENTRY_REVERSED",
        entityType: "JournalEntry",
        entityId: id,
        details: { number: entry.number, reversalNumber: nextNumber },
      }).catch((err) =>
        console.warn("[journal] Non-critical:", err instanceof Error ? err.message : err)
      );

      return NextResponse.json({ success: true, status: "REVERSED", reversalNumber: nextNumber });
    }

    return NextResponse.json({ error: "Acción no válida. Use 'post' o 'reverse'." }, { status: 400 });
  },
  "manage:settings"
);

/**
 * DELETE /api/journal-entries/[id] — delete a DRAFT entry
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    const id = ctx.params?.id;
    if (!id) return NextResponse.json({ error: "ID requerido." }, { status: 400 });

    const entry = await db.journalEntry.findFirst({
      where: { id, companyId: ctx.company.id },
    });

    if (!entry) {
      return NextResponse.json({ error: "Asiento no encontrado." }, { status: 404 });
    }

    if (entry.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar asientos en borrador." },
        { status: 400 }
      );
    }

    await db.journalEntry.delete({ where: { id } });

    return NextResponse.json({ success: true });
  },
  "manage:settings"
);
