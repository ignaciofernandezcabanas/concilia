/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const updateSchema = z.object({
  iban: z.string().optional(),
  bankName: z.string().optional(),
  alias: z.string().min(1).optional(),
  accountType: z
    .enum(["CHECKING", "SAVINGS", "CREDIT_LINE", "LOAN", "CREDIT_CARD", "CONFIRMING", "FACTORING"])
    .optional(),
  connectionMethod: z.enum(["PSD2", "FILE_IMPORT"]).optional(),
  pgcAccountCode: z.string().optional(),
  lastFourDigits: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  contractNumber: z.string().optional(),
  detectionPattern: z.string().optional(),
  creditLimit: z.number().positive().optional().nullable(),
  interestRate: z.number().min(0).max(100).optional().nullable(),
  monthlyPayment: z.number().positive().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  maturityDate: z.coerce.date().optional().nullable(),
  paymentDay: z.number().int().min(1).max(31).optional().nullable(),
  initialBalance: z.number().optional().nullable(),
  initialBalanceDate: z.coerce.date().optional().nullable(),
  currentBalance: z.number().optional().nullable(),
  currentBalanceDate: z.coerce.date().optional().nullable(),
  currency: z.string().length(3).optional(),
});

/**
 * GET /api/bank-accounts/[id]
 * Full detail with stats.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    try {
      const db = ctx.db;
      const id = ctx.params?.id;
      if (!id) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 });
      }

      const account = await (db as any).ownBankAccount.findFirst({
        where: { id },
        include: { debtInstruments: true },
      });

      if (!account) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }

      // Transaction count
      const transactionCount = account.iban
        ? await db.bankTransaction.count({
            where: { counterpartIban: account.iban },
          })
        : 0;

      return NextResponse.json({ ...account, transactionCount });
    } catch (err) {
      return errorResponse("Error al obtener cuenta bancaria", err);
    }
  },
  "read:transactions"
);

/**
 * PUT /api/bank-accounts/[id]
 * Update bank account. Protects IBAN change if has transactions.
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    try {
      const db = ctx.db;
      const id = ctx.params?.id;
      if (!id) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 });
      }

      const body = await req.json();
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos no válidos", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const existing = await (db as any).ownBankAccount.findFirst({
        where: { id },
      });
      if (!existing) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }

      // Block IBAN change if account has transactions
      const data = parsed.data;
      if (data.iban && data.iban !== existing.iban && existing.iban) {
        const txCount = await db.bankTransaction.count({
          where: { counterpartIban: existing.iban },
        });
        if (txCount > 0) {
          return NextResponse.json(
            {
              error: "No se puede cambiar el IBAN de una cuenta con movimientos asociados",
            },
            { status: 409 }
          );
        }
      }

      // Normalize IBAN
      if (data.iban) {
        data.iban = data.iban.replace(/\s/g, "").toUpperCase();
      }

      const updated = await (db as any).ownBankAccount.update({
        where: { id },
        data,
      });

      return NextResponse.json(updated);
    } catch (err) {
      return errorResponse("Error al actualizar cuenta bancaria", err);
    }
  },
  "manage:settings"
);
