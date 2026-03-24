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
      const inv = await db.investment.findUnique({
        where: { id },
        include: { transactions: { orderBy: { date: "desc" } } },
      });
      if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(inv);
    } catch (err) {
      return errorResponse("Failed to get investment", err);
    }
  }
);

const updateSchema = z.object({
  name: z.string().optional(),
  currentValue: z.number().optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  status: z.enum(["ACTIVE", "PARTIALLY_DIVESTED", "FULLY_DIVESTED"]).optional(),
});

export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const body = await req.json();
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      const update: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.currentValue) update.lastValuationDate = new Date();
      const inv = await db.investment.update({ where: { id }, data: update });
      return NextResponse.json(inv);
    } catch (err) {
      return errorResponse("Failed to update investment", err);
    }
  }
);
