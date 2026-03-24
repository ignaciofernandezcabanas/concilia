import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const txs = await db.investmentTransaction.findMany({
        where: { investmentId: id },
        orderBy: { date: "desc" },
      });
      return NextResponse.json({ data: txs });
    } catch (err) {
      return errorResponse("Failed to list transactions", err);
    }
  }
);

const createTxSchema = z.object({
  type: z.enum([
    "ACQUISITION",
    "PARTIAL_DIVESTMENT",
    "FULL_DIVESTMENT",
    "DIVIDEND_RECEIVED",
    "INTEREST_RECEIVED",
    "CAPITAL_CALL",
    "RETURN_OF_CAPITAL",
    "VALUATION_ADJUSTMENT",
    "IMPAIRMENT",
  ]),
  date: z.string(),
  amount: z.number().positive(),
  pgcDebitAccount: z.string().min(2),
  pgcCreditAccount: z.string().min(2),
  bankTransactionId: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const body = await req.json();
      const parsed = createTxSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      const tx = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).investmentTransaction.create({
          data: { ...parsed.data, date: new Date(parsed.data.date), investmentId: id },
        });
      return NextResponse.json(tx, { status: 201 });
    } catch (err) {
      return errorResponse("Failed to create transaction", err);
    }
  }
);
