/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /api/debt-instruments/[id]
// ---------------------------------------------------------------------------

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const instrument = await (db as any).debtInstrument.findUnique({
        where: { id },
        include: {
          schedule: { orderBy: { entryNumber: "asc" } },
          transactions: { orderBy: { date: "desc" } },
          covenants: true,
        },
      });

      if (!instrument) {
        return NextResponse.json({ error: "Instrumento no encontrado" }, { status: 404 });
      }

      return NextResponse.json(instrument);
    } catch (err) {
      return errorResponse("Failed to get debt instrument", err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/debt-instruments/[id]
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  bankEntityName: z.string().min(1).optional(),
  interestRateType: z.enum(["FIXED", "VARIABLE"]).optional(),
  interestRateValue: z.number().min(0).optional(),
  referenceRate: z.string().optional(),
  spread: z.number().optional(),
  maturityDate: z.string().optional(),
  paymentDay: z.number().int().min(1).max(28).optional(),
  paymentFrequency: z
    .enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ON_DEMAND", "BULLET"])
    .optional(),
  creditLimit: z.number().positive().optional(),
  contractDocUrl: z.string().optional(),
  bankAccountId: z.string().optional(),
  status: z.enum(["ACTIVE", "MATURED", "REFINANCED", "DEFAULT"]).optional(),
  notes: z.string().optional(),
});

export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const body = await req.json();
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.maturityDate) {
        updateData.maturityDate = new Date(parsed.data.maturityDate);
      }

      const instrument = await (db as any).debtInstrument.update({
        where: { id },
        data: updateData,
        include: { schedule: true, covenants: true, transactions: true },
      });

      return NextResponse.json(instrument);
    } catch (err) {
      return errorResponse("Failed to update debt instrument", err);
    }
  }
);
