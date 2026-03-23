import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { checkPeriodOpen } from "@/lib/utils/period-guard";
import { z } from "zod";

/**
 * GET /api/journal-entries?from=2026-01-01&to=2026-03-31&status=POSTED&page=1&limit=20
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const url = req.nextUrl;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const status = url.searchParams.get("status");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where = {
      companyId: ctx.company.id,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(status ? { status: status as "DRAFT" | "POSTED" | "REVERSED" } : {}),
    };

    const [data, total] = await Promise.all([
      db.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: { account: { select: { code: true, name: true } } },
          },
        },
        orderBy: [{ date: "desc" }, { number: "desc" }],
        skip,
        take: limit,
      }),
      db.journalEntry.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
  "read:reports"
);

const lineSchema = z.object({
  accountCode: z.string().min(1),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  description: z.string().optional(),
});

const createSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  description: z.string().min(1),
  reference: z.string().optional(),
  lines: z.array(lineSchema).min(2),
});

/**
 * POST /api/journal-entries
 *
 * Creates a manual journal entry.
 * Lines must balance (total debits = total credits).
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, description, reference, lines } = parsed.data;

    // Check period is open
    const periodError = await checkPeriodOpen(db, ctx.company.id, date);
    if (periodError) {
      return NextResponse.json({ error: periodError }, { status: 400 });
    }

    // Validate balance
    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { error: `El asiento no cuadra: Debe (${totalDebit.toFixed(2)}) ≠ Haber (${totalCredit.toFixed(2)}).` },
        { status: 400 }
      );
    }

    // Each line must have either debit or credit, not both
    for (const line of lines) {
      if (line.debit > 0 && line.credit > 0) {
        return NextResponse.json(
          { error: "Cada línea debe tener Debe o Haber, no ambos." },
          { status: 400 }
        );
      }
      if (line.debit === 0 && line.credit === 0) {
        return NextResponse.json(
          { error: "Cada línea debe tener un importe." },
          { status: 400 }
        );
      }
    }

    // Resolve account codes to IDs
    const accountCodes = Array.from(new Set(lines.map((l) => l.accountCode)));
    const accounts = await db.account.findMany({
      where: { code: { in: accountCodes }, companyId: ctx.company.id },
      select: { id: true, code: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

    for (const line of lines) {
      if (!accountMap.has(line.accountCode)) {
        return NextResponse.json(
          { error: `Cuenta ${line.accountCode} no encontrada.` },
          { status: 400 }
        );
      }
    }

    // Get next number
    const lastEntry = await db.journalEntry.findFirst({
      where: { companyId: ctx.company.id },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const nextNumber = (lastEntry?.number ?? 0) + 1;

    const entry = await db.journalEntry.create({
      data: {
        number: nextNumber,
        date,
        description,
        reference,
        type: "MANUAL",
        status: "DRAFT",
        companyId: ctx.company.id,
        createdById: ctx.user.id,
        lines: {
          create: lines.map((l) => ({
            debit: l.debit,
            credit: l.credit,
            description: l.description,
            accountId: accountMap.get(l.accountCode)!,
          })),
        },
      },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
        },
      },
    });

    createAuditLog(db, {
      userId: ctx.user.id,
      action: "JOURNAL_ENTRY_CREATED",
      entityType: "JournalEntry",
      entityId: entry.id,
      details: { number: nextNumber, totalDebit },
    }).catch((err) =>
      console.warn("[journal] Non-critical:", err instanceof Error ? err.message : err)
    );

    return NextResponse.json({ success: true, entry }, { status: 201 });
  },
  "manage:settings"
);
