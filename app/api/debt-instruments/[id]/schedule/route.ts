/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";
import { generateAmortizationSchedule } from "@/lib/debt/amortization-schedule";

const entrySchema = z.object({
  entryNumber: z.number().int().positive(),
  dueDate: z.string(),
  principalAmount: z.number().min(0),
  interestAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  outstandingAfter: z.number().min(0),
});

const scheduleSchema = z.union([
  z.object({ generate: z.literal(true) }),
  z.object({ entries: z.array(entrySchema).min(1) }),
]);

// ---------------------------------------------------------------------------
// POST /api/debt-instruments/[id]/schedule
// ---------------------------------------------------------------------------

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext, routeCtx?: { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = routeCtx?.params?.id;
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

      const body = await req.json();
      const parsed = scheduleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      // Load instrument
      const instrument = await (db as any).debtInstrument.findUnique({
        where: { id },
        include: { schedule: true },
      });
      if (!instrument) {
        return NextResponse.json({ error: "Instrumento no encontrado" }, { status: 404 });
      }

      // Determine schedule entries
      let entries;
      if ("generate" in parsed.data && parsed.data.generate) {
        const startDate = new Date(instrument.startDate);
        const maturityDate = new Date(instrument.maturityDate);
        const termMonths =
          (maturityDate.getFullYear() - startDate.getFullYear()) * 12 +
          (maturityDate.getMonth() - startDate.getMonth());

        let graceMonths = 0;
        if (instrument.gracePeriodEndDate) {
          const graceEnd = new Date(instrument.gracePeriodEndDate);
          graceMonths =
            (graceEnd.getFullYear() - startDate.getFullYear()) * 12 +
            (graceEnd.getMonth() - startDate.getMonth());
        }

        entries = generateAmortizationSchedule({
          principal: instrument.principalAmount,
          annualRate: instrument.interestRateValue,
          termMonths,
          graceMonths: graceMonths > 0 ? graceMonths : undefined,
          startDate,
          paymentDay: instrument.paymentDay ?? 5,
        });
      } else if ("entries" in parsed.data) {
        entries = parsed.data.entries.map((e) => ({
          ...e,
          dueDate: new Date(e.dueDate),
        }));
      } else {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      // Delete unmatched future entries, keep matched ones
      const now = new Date();
      const unmatchedFutureIds = instrument.schedule
        .filter((e: any) => !e.matched && new Date(e.dueDate) >= now)
        .map((e: any) => e.id);

      if (unmatchedFutureIds.length > 0) {
        await (db as any).debtScheduleEntry.deleteMany({
          where: { id: { in: unmatchedFutureIds } },
        });
      }

      // Create new entries
      const created = await Promise.all(
        entries.map((e: any) =>
          (db as any).debtScheduleEntry.create({
            data: {
              debtInstrumentId: id,
              entryNumber: e.entryNumber,
              dueDate: e.dueDate instanceof Date ? e.dueDate : new Date(e.dueDate),
              principalAmount: e.principalAmount,
              interestAmount: e.interestAmount,
              totalAmount: e.totalAmount,
              outstandingAfter: e.outstandingAfter,
            },
          })
        )
      );

      return NextResponse.json({ created: created.length, schedule: created }, { status: 201 });
    } catch (err) {
      return errorResponse("Failed to update schedule", err);
    }
  }
);
