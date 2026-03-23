import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

/**
 * GET /api/reports/ledger?accountCode=430&from=2026-01-01&to=2026-03-31
 *
 * General ledger (Libro Mayor) — all movements for a specific account.
 *
 * Sources:
 * 1. Journal entry lines (double-entry)
 * 2. Classified bank transactions (single-entry, mapped to debit/credit)
 * 3. Invoice lines linked to this account (accrual entries)
 *
 * Returns movements in chronological order with running balance.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    const url = req.nextUrl;
    const accountCode = url.searchParams.get("accountCode");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!accountCode) {
      return NextResponse.json(
        { error: 'Query parameter "accountCode" is required.' },
        { status: 400 }
      );
    }

    const account = await db.account.findUnique({
      where: { code_companyId: { code: accountCode, companyId: ctx.company.id } },
      select: { id: true, code: true, name: true, group: true },
    });

    if (!account) {
      return NextResponse.json({ error: `Cuenta ${accountCode} no encontrada.` }, { status: 404 });
    }

    const dateFilter = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
    const hasDateFilter = from || to;

    // 1. Journal entry lines
    const journalLines = await db.journalEntryLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          companyId: ctx.company.id,
          status: "POSTED",
          ...(hasDateFilter ? { date: dateFilter } : {}),
        },
      },
      include: {
        journalEntry: {
          select: { number: true, date: true, description: true, type: true, reference: true },
        },
      },
      orderBy: { journalEntry: { date: "asc" } },
    });

    // 2. Classified bank transactions
    const classifiedTx = await db.bankTransaction.findMany({
      where: {
        companyId: ctx.company.id,
        status: "CLASSIFIED",
        classification: { accountId: account.id },
        ...(hasDateFilter ? { valueDate: dateFilter } : {}),
      },
      include: {
        classification: { select: { description: true } },
      },
      orderBy: { valueDate: "asc" },
    });

    // 3. Invoice lines
    const invoiceLines = await db.invoiceLine.findMany({
      where: {
        accountId: account.id,
        invoice: {
          companyId: ctx.company.id,
          ...(hasDateFilter ? { issueDate: dateFilter } : {}),
        },
      },
      include: {
        invoice: {
          select: { number: true, issueDate: true, type: true, description: true, contact: { select: { name: true } } },
        },
      },
    });

    // Build unified movements list
    type Movement = {
      date: Date;
      description: string;
      reference: string | null;
      source: string;
      sourceId: string;
      debit: number;
      credit: number;
    };

    const movements: Movement[] = [];

    // Journal entries → direct debit/credit
    for (const line of journalLines) {
      movements.push({
        date: line.journalEntry.date,
        description: line.description ?? line.journalEntry.description,
        reference: line.journalEntry.reference ?? `Asiento #${line.journalEntry.number}`,
        source: "journal",
        sourceId: line.journalEntryId,
        debit: line.debit,
        credit: line.credit,
      });
    }

    // Classified bank transactions → map to debit/credit based on account group
    // Groups 1-3 (assets/inventory): debit = increase, credit = decrease
    // Groups 4-5 (liabilities): debit = decrease, credit = increase
    // Group 6 (expenses): debit = increase
    // Group 7 (income): credit = increase
    for (const tx of classifiedTx) {
      const isDebitNature = account.group <= 3 || account.group === 6;
      const amount = Math.abs(tx.amount);

      if (tx.amount < 0) {
        // Outflow (payment)
        movements.push({
          date: tx.valueDate,
          description: tx.classification?.description ?? tx.conceptParsed ?? tx.concept ?? "Movimiento bancario",
          reference: tx.externalId,
          source: "bank_transaction",
          sourceId: tx.id,
          debit: isDebitNature ? amount : 0,
          credit: isDebitNature ? 0 : amount,
        });
      } else {
        // Inflow (receipt)
        movements.push({
          date: tx.valueDate,
          description: tx.classification?.description ?? tx.conceptParsed ?? tx.concept ?? "Movimiento bancario",
          reference: tx.externalId,
          source: "bank_transaction",
          sourceId: tx.id,
          debit: isDebitNature ? 0 : amount,
          credit: isDebitNature ? amount : 0,
        });
      }
    }

    // Invoice lines → accrual entry
    for (const line of invoiceLines) {
      const inv = line.invoice;
      const isIssued = inv.type === "ISSUED" || inv.type === "CREDIT_ISSUED";
      movements.push({
        date: inv.issueDate,
        description: `${inv.number} — ${inv.contact?.name ?? ""} ${line.description ?? ""}`.trim(),
        reference: inv.number,
        source: "invoice",
        sourceId: line.invoiceId,
        debit: isIssued ? 0 : line.totalAmount,
        credit: isIssued ? line.totalAmount : 0,
      });
    }

    // Sort by date
    movements.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running balance
    let balance = 0;
    const isDebitNature = account.group <= 3 || account.group === 6;
    const withBalance = movements.map((m) => {
      balance += isDebitNature ? m.debit - m.credit : m.credit - m.debit;
      return { ...m, balance: Math.round(balance * 100) / 100 };
    });

    // Totals
    const totalDebit = movements.reduce((s, m) => s + m.debit, 0);
    const totalCredit = movements.reduce((s, m) => s + m.credit, 0);

    return NextResponse.json({
      account: { code: account.code, name: account.name, group: account.group },
      movements: withBalance,
      totals: {
        debit: Math.round(totalDebit * 100) / 100,
        credit: Math.round(totalCredit * 100) / 100,
        balance: Math.round(balance * 100) / 100,
      },
      count: movements.length,
    });
  },
  "read:reports"
);
