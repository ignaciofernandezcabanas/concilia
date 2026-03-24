import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const investments = await db.investment.findMany({
      include: { transactions: { orderBy: { date: "desc" }, take: 5 } },
      orderBy: { acquisitionDate: "desc" },
    });
    return NextResponse.json({ data: investments });
  } catch (err) {
    return errorResponse("Failed to list investments", err);
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "EQUITY_SUBSIDIARY",
    "EQUITY_ASSOCIATE",
    "EQUITY_OTHER",
    "DEBT_INSTRUMENT",
    "LOAN_GRANTED",
    "FUND",
  ]),
  pgcAccount: z.string().min(2),
  isinCif: z.string().optional(),
  acquisitionDate: z.string(),
  acquisitionCost: z.number().positive(),
  sharesUnits: z.number().optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
  valuationMethod: z.enum(["COST", "FAIR_VALUE", "EQUITY_METHOD"]).default("COST"),
  notes: z.string().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );

    const investment = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.investment as any).create({
        data: {
          ...parsed.data,
          acquisitionDate: new Date(parsed.data.acquisitionDate),
          currentValue: parsed.data.acquisitionCost,
          lastValuationDate: new Date(parsed.data.acquisitionDate),
        },
      });
    return NextResponse.json(investment, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create investment", err);
  }
});
