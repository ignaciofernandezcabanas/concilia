import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/reports/trial-balance?from=2026-01-01&to=2026-03-31
 *
 * Balance de Sumas y Saldos (Trial Balance).
 * Aggregates all journal entry lines by account within the period.
 * Returns total debits, total credits, and net balance per account.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const url = req.nextUrl;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Query parameters "from" and "to" are required (YYYY-MM-DD).' },
        { status: 400 }
      );
    }

    // Get all posted journal entry lines in the period
    const lines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: ctx.company.id,
          status: "POSTED",
          date: { gte: new Date(from), lte: new Date(to) },
        },
      },
      include: {
        account: { select: { code: true, name: true, group: true } },
      },
    });

    // Aggregate by account
    const accountMap = new Map<
      string,
      { code: string; name: string; group: number; debit: number; credit: number }
    >();

    for (const line of lines) {
      const key = line.account.code;
      const existing = accountMap.get(key);
      if (existing) {
        existing.debit += line.debit;
        existing.credit += line.credit;
      } else {
        accountMap.set(key, {
          code: line.account.code,
          name: line.account.name,
          group: line.account.group,
          debit: line.debit,
          credit: line.credit,
        });
      }
    }

    // Convert to sorted array
    const accounts = Array.from(accountMap.values())
      .map((a) => ({
        ...a,
        debit: Math.round(a.debit * 100) / 100,
        credit: Math.round(a.credit * 100) / 100,
        balance: Math.round((a.debit - a.credit) * 100) / 100,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
    const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

    return NextResponse.json({
      accounts,
      totals: {
        debit: Math.round(totalDebit * 100) / 100,
        credit: Math.round(totalCredit * 100) / 100,
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
      period: { from, to },
      count: accounts.length,
    });
  },
  "read:reports"
);
