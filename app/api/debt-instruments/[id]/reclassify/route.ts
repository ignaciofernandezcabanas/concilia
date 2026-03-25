/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const reclassifySchema = z.object({
  closingDate: z.string(),
  confirm: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/debt-instruments/[id]/reclassify
// ---------------------------------------------------------------------------

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const body = await req.json();
      const parsed = reclassifySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const closingDate = new Date(parsed.data.closingDate);
      const oneYearFromClosing = new Date(closingDate);
      oneYearFromClosing.setFullYear(oneYearFromClosing.getFullYear() + 1);

      // Load instrument with future schedule
      const instrument = await (db as any).debtInstrument.findUnique({
        where: { id },
        include: {
          schedule: {
            where: {
              dueDate: { gt: closingDate, lte: oneYearFromClosing },
              matched: false,
            },
            orderBy: { dueDate: "asc" },
          },
        },
      });

      if (!instrument) {
        return NextResponse.json({ error: "Instrumento no encontrado" }, { status: 404 });
      }

      // Calculate short-term principal (due within 1 year from closing)
      const shortTermPrincipal = instrument.schedule.reduce(
        (sum: number, e: any) => sum + e.principalAmount,
        0
      );
      const entriesAffected = instrument.schedule.length;

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const amount = round2(shortTermPrincipal);

      // Preview mode
      if (!parsed.data.confirm) {
        return NextResponse.json({
          preview: true,
          amount,
          entriesAffected,
          description: `Reclasificación L/P → C/P: ${amount.toFixed(2)}€ (${entriesAffected} cuotas vencen antes del ${oneYearFromClosing.toISOString().slice(0, 10)})`,
          pgcDebitAccount: "170", // Deudas L/P con entidades de crédito
          pgcCreditAccount: "520", // Deudas C/P con entidades de crédito
        });
      }

      if (amount <= 0) {
        return NextResponse.json(
          { error: "No hay importe a reclasificar en el periodo indicado." },
          { status: 400 }
        );
      }

      // Resolve accounts
      const accounts = await db.account.findMany({
        where: { code: { in: ["170", "520"] }, companyId: ctx.company.id },
        select: { id: true, code: true },
      });
      const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

      const debitAccountId = accountMap.get("170");
      const creditAccountId = accountMap.get("520");

      if (!debitAccountId || !creditAccountId) {
        return NextResponse.json(
          { error: "Cuentas PGC 170 y/o 520 no encontradas. Revise el plan de cuentas." },
          { status: 400 }
        );
      }

      // Create journal entry
      const lastEntry = await db.journalEntry.findFirst({
        where: { companyId: ctx.company.id },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const nextNumber = (lastEntry?.number ?? 0) + 1;

      const je = await db.journalEntry.create({
        data: {
          number: nextNumber,
          date: closingDate,
          description: `Reclasificación LP→CP deuda: ${instrument.name} (${amount.toFixed(2)}€)`,
          type: "ADJUSTMENT",
          status: "POSTED",
          companyId: ctx.company.id,
          createdById: ctx.user.id,
          lines: {
            create: [
              {
                debit: amount,
                credit: 0,
                accountId: debitAccountId,
                description: "Reclasificación LP→CP",
              },
              {
                debit: 0,
                credit: amount,
                accountId: creditAccountId,
                description: "Reclasificación LP→CP",
              },
            ],
          },
        },
      });

      // Create debt transaction
      const debtTx = await (db as any).debtTransaction.create({
        data: {
          debtInstrumentId: id,
          type: "RECLASSIFICATION_LP_CP",
          date: closingDate,
          amount,
          pgcDebitAccount: "170",
          pgcCreditAccount: "520",
          journalEntryId: je.id,
          notes: `Reclasificación cierre ${closingDate.toISOString().slice(0, 10)}`,
        },
      });

      return NextResponse.json({
        success: true,
        amount,
        entriesAffected,
        journalEntryId: je.id,
        debtTransactionId: debtTx.id,
      });
    } catch (err) {
      return errorResponse("Failed to reclassify debt", err);
    }
  }
);
