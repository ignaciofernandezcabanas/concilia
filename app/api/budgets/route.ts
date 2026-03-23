import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { z } from "zod";

/**
 * GET /api/budgets?year=2026
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const year = parseInt(req.nextUrl.searchParams.get("year") || String(new Date().getFullYear()));

    const budget = await db.budget.findFirst({
      where: { companyId: ctx.company.id, year },
      include: { lines: { orderBy: [{ accountCode: "asc" }, { month: "asc" }] } },
    });

    if (!budget) {
      return NextResponse.json({ budget: null, year });
    }

    // Group lines by account for easier consumption
    const byAccount = new Map<string, { accountCode: string; months: Record<number, number>; total: number }>();
    for (const line of budget.lines) {
      const existing = byAccount.get(line.accountCode);
      if (existing) {
        existing.months[line.month] = line.amount;
        existing.total += line.amount;
      } else {
        byAccount.set(line.accountCode, {
          accountCode: line.accountCode,
          months: { [line.month]: line.amount },
          total: line.amount,
        });
      }
    }

    return NextResponse.json({
      budget: {
        id: budget.id,
        year: budget.year,
        name: budget.name,
        status: budget.status,
        accounts: Array.from(byAccount.values()),
      },
      year,
    });
  },
  "read:reports"
);

const createSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  name: z.string().default("Presupuesto anual"),
  lines: z.array(
    z.object({
      accountCode: z.string().min(1),
      month: z.number().int().min(1).max(12),
      amount: z.number(),
    })
  ),
});

/**
 * POST /api/budgets
 *
 * Creates or updates a budget. Uperts lines.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const { year, name, lines } = parsed.data;

    // Upsert budget
    const budget = await db.budget.upsert({
      where: { companyId_year_name: { companyId: ctx.company.id, year, name } },
      create: { year, name, companyId: ctx.company.id },
      update: { updatedAt: new Date() },
    });

    // Upsert lines
    for (const line of lines) {
      await db.budgetLine.upsert({
        where: {
          budgetId_accountCode_month: {
            budgetId: budget.id,
            accountCode: line.accountCode,
            month: line.month,
          },
        },
        create: {
          budgetId: budget.id,
          accountCode: line.accountCode,
          month: line.month,
          amount: line.amount,
        },
        update: { amount: line.amount },
      });
    }

    return NextResponse.json({ success: true, budgetId: budget.id, linesUpserted: lines.length });
  },
  "manage:settings"
);

/**
 * PUT /api/budgets — change budget status
 * Body: { year, action: "approve" | "close" | "reopen" }
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const body = await req.json();
    const { year, action } = body;

    const budget = await db.budget.findFirst({
      where: { companyId: ctx.company.id, year },
    });

    if (!budget) {
      return NextResponse.json({ error: "Presupuesto no encontrado." }, { status: 404 });
    }

    const transitions: Record<string, { from: string[]; to: string }> = {
      approve: { from: ["DRAFT"], to: "APPROVED" },
      close: { from: ["APPROVED"], to: "CLOSED" },
      reopen: { from: ["APPROVED", "CLOSED"], to: "DRAFT" },
    };

    const t = transitions[action];
    if (!t) {
      return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
    if (!t.from.includes(budget.status)) {
      return NextResponse.json(
        { error: `No se puede ${action} un presupuesto en estado ${budget.status}.` },
        { status: 400 }
      );
    }

    await db.budget.update({
      where: { id: budget.id },
      data: { status: t.to as "DRAFT" | "APPROVED" | "CLOSED" },
    });

    return NextResponse.json({ success: true, status: t.to });
  },
  "manage:settings"
);
