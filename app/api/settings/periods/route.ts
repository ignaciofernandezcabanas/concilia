import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { z } from "zod";

/**
 * GET /api/settings/periods?year=2026
 *
 * Lists accounting periods for the company.
 * Auto-creates missing periods for the requested year.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  // Ensure all 12 months exist for this year
  const existing = await db.accountingPeriod.findMany({
    where: { companyId: ctx.company.id, year },
    orderBy: { month: "asc" },
  });

  if (existing.length < 12) {
    const existingMonths = new Set(existing.map((p) => p.month));
    const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (m) => !existingMonths.has(m)
    );

    if (missing.length > 0) {
      await db.accountingPeriod.createMany({
        data: missing.map((month) => ({
          year,
          month,
          status: "OPEN",
          companyId: ctx.company.id,
        })),
        skipDuplicates: true,
      });
    }

    const all = await db.accountingPeriod.findMany({
      where: { companyId: ctx.company.id, year },
      orderBy: { month: "asc" },
    });
    return NextResponse.json({ periods: all, year });
  }

  return NextResponse.json({ periods: existing, year });
}, "read:dashboard");

const updateSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  month: z.number().int().min(1).max(12),
  action: z.enum(["close", "soft_close", "reopen", "lock"]),
  notes: z.string().optional(),
});

/**
 * PUT /api/settings/periods
 *
 * Close, reopen, or lock an accounting period.
 * - close: OPEN → CLOSED (prevents new transactions in this period)
 * - reopen: CLOSED → OPEN (allows corrections)
 * - lock: CLOSED → LOCKED (permanent, requires ADMIN)
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { year, month, action, notes } = parsed.data;

  const period = await db.accountingPeriod.findUnique({
    where: {
      companyId_year_month: { companyId: ctx.company.id, year, month },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Periodo no encontrado." }, { status: 404 });
  }

  // State machine validations
  if (action === "close" && period.status !== "OPEN" && period.status !== "SOFT_CLOSED") {
    return NextResponse.json(
      { error: "Solo se puede cerrar un periodo abierto o en cierre provisional." },
      { status: 400 }
    );
  }
  if (action === "soft_close" && period.status !== "OPEN") {
    return NextResponse.json(
      { error: "Solo se puede hacer cierre provisional de un periodo abierto." },
      { status: 400 }
    );
  }
  if (action === "reopen" && period.status !== "CLOSED" && period.status !== "SOFT_CLOSED") {
    return NextResponse.json(
      { error: "Solo se puede reabrir un periodo cerrado o en cierre provisional (no bloqueado)." },
      { status: 400 }
    );
  }
  if (action === "lock" && period.status !== "CLOSED") {
    return NextResponse.json(
      { error: "Solo se puede bloquear un periodo cerrado." },
      { status: 400 }
    );
  }

  const statusMap = {
    close: "CLOSED" as const,
    soft_close: "SOFT_CLOSED" as const,
    lock: "LOCKED" as const,
    reopen: "OPEN" as const,
  };
  const newStatus = statusMap[action];

  const updated = await db.accountingPeriod.update({
    where: { id: period.id },
    data: {
      status: newStatus,
      closedAt: action === "close" || action === "lock" ? new Date() : null,
      closedById: action === "close" || action === "lock" ? ctx.user.id : null,
      notes: notes ?? period.notes,
    },
  });

  createAuditLog(db, {
    userId: ctx.user.id,
    action: `PERIOD_${action.toUpperCase()}`,
    entityType: "AccountingPeriod",
    entityId: period.id,
    details: { year, month, from: period.status, to: newStatus },
  }).catch((err) =>
    console.warn(
      "[periods] Non-critical operation failed:",
      err instanceof Error ? err.message : err
    )
  );

  return NextResponse.json({ success: true, period: updated });
}, "manage:settings");
