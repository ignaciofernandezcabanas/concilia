/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const createTxSchema = z.object({
  type: z.enum([
    "DRAWDOWN",
    "REPAYMENT",
    "INSTALLMENT_PRINCIPAL",
    "INSTALLMENT_INTEREST",
    "INTEREST_PAYMENT",
    "COMMISSION",
    "INTEREST_ACCRUAL",
    "RECLASSIFICATION_LP_CP",
    "DISCOUNT_ADVANCE",
    "DISCOUNT_SETTLEMENT",
    "DISCOUNT_DEFAULT",
    "EARLY_REPAYMENT",
    "LEASE_PAYMENT",
  ]),
  date: z.string(),
  amount: z.number(),
  pgcDebitAccount: z.string().min(2),
  pgcCreditAccount: z.string().min(2),
  bankTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/debt-instruments/[id]/transactions
// ---------------------------------------------------------------------------

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const body = await req.json();
      const parsed = createTxSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      // Verify instrument exists
      const instrument = await (db as any).debtInstrument.findUnique({ where: { id } });
      if (!instrument) {
        return NextResponse.json({ error: "Instrumento no encontrado" }, { status: 404 });
      }

      // Resolve accounts for journal entry
      const accounts = await db.account.findMany({
        where: {
          code: { in: [parsed.data.pgcDebitAccount, parsed.data.pgcCreditAccount] },
          companyId: ctx.company.id,
        },
        select: { id: true, code: true },
      });
      const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

      const debitAccountId = accountMap.get(parsed.data.pgcDebitAccount);
      const creditAccountId = accountMap.get(parsed.data.pgcCreditAccount);

      let journalEntryId: string | null = null;

      if (debitAccountId && creditAccountId) {
        // Get next JE number
        const lastEntry = await db.journalEntry.findFirst({
          where: { companyId: ctx.company.id },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (lastEntry?.number ?? 0) + 1;

        const je = await db.journalEntry.create({
          data: {
            number: nextNumber,
            date: new Date(parsed.data.date),
            description: `Deuda: ${parsed.data.type} — ${instrument.name}`,
            type: "ADJUSTMENT",
            status: "POSTED",
            companyId: ctx.company.id,
            createdById: ctx.user.id,
            lines: {
              create: [
                {
                  debit: Math.abs(parsed.data.amount),
                  credit: 0,
                  accountId: debitAccountId,
                  description: parsed.data.notes ?? parsed.data.type,
                },
                {
                  debit: 0,
                  credit: Math.abs(parsed.data.amount),
                  accountId: creditAccountId,
                  description: parsed.data.notes ?? parsed.data.type,
                },
              ],
            },
          },
        });
        journalEntryId = je.id;
      }

      const tx = await (db as any).debtTransaction.create({
        data: {
          debtInstrumentId: id,
          type: parsed.data.type,
          date: new Date(parsed.data.date),
          amount: parsed.data.amount,
          pgcDebitAccount: parsed.data.pgcDebitAccount,
          pgcCreditAccount: parsed.data.pgcCreditAccount,
          bankTransactionId: parsed.data.bankTransactionId ?? null,
          journalEntryId,
          notes: parsed.data.notes,
        },
      });

      return NextResponse.json(tx, { status: 201 });
    } catch (err) {
      return errorResponse("Failed to create debt transaction", err);
    }
  }
);
