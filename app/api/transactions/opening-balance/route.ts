import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
  balance: z.number(),
});

/**
 * POST /api/transactions/opening-balance
 *
 * Creates an opening balance transaction. Idempotent per date.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, balance } = parsed.data;
    const externalId = `opening_balance_${date}`;

    // Idempotency: check if already exists
    const existing = await db.bankTransaction.findFirst({
      where: { externalId },
    });

    if (existing) {
      // Update existing opening balance
      await db.bankTransaction.update({
        where: { id: existing.id },
        data: { balanceAfter: balance },
      });
      return NextResponse.json({
        success: true,
        updated: true,
        id: existing.id,
        balance,
        date,
      });
    }

    const tx = await db.bankTransaction.create({
      data: {
        externalId,
        valueDate: new Date(date),
        bookingDate: new Date(date),
        amount: 0,
        currency: "EUR",
        concept: "Saldo inicial",
        balanceAfter: balance,
        status: "RECONCILED",
        detectedType: "OPENING_BALANCE",
        priority: "ROUTINE",
        companyId: ctx.company.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    return NextResponse.json(
      {
        success: true,
        updated: false,
        id: tx.id,
        balance,
        date,
      },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse("Error al crear saldo inicial.", err);
  }
}, "resolve:reconciliation");
