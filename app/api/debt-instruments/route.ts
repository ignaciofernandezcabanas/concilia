/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";
import { generateAmortizationSchedule, type ScheduleEntry } from "@/lib/debt/amortization-schedule";

// ---------------------------------------------------------------------------
// GET /api/debt-instruments?status=ACTIVE&type=TERM_LOAN
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const url = req.nextUrl;
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const instruments = await (db as any).debtInstrument.findMany({
      where,
      include: {
        covenants: true,
        schedule: { orderBy: { dueDate: "asc" }, take: 5, where: { matched: false } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Summary counts
    const allInstruments = await (db as any).debtInstrument.findMany({
      select: { status: true, type: true },
    });
    const summary = {
      total: allInstruments.length,
      active: allInstruments.filter((i: any) => i.status === "ACTIVE").length,
      byType: Object.entries(
        allInstruments.reduce(
          (acc: Record<string, number>, i: any) => {
            acc[i.type] = (acc[i.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      ).map(([type, count]) => ({ type, count })),
    };

    return NextResponse.json({ data: instruments, summary });
  } catch (err) {
    return errorResponse("Failed to list debt instruments", err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/debt-instruments
// ---------------------------------------------------------------------------

const scheduleEntrySchema = z.object({
  entryNumber: z.number().int().positive(),
  dueDate: z.string(),
  principalAmount: z.number().min(0),
  interestAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  outstandingAfter: z.number().min(0),
});

const covenantSchema = z.object({
  name: z.string().min(1),
  metric: z.enum([
    "DEBT_TO_EBITDA",
    "DSCR",
    "CURRENT_RATIO",
    "NET_WORTH",
    "EQUITY_RATIO",
    "LEVERAGE_RATIO",
  ]),
  threshold: z.number(),
  operator: z.enum(["LT", "LTE", "GT", "GTE"]),
  testFrequency: z
    .enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ON_DEMAND", "BULLET"])
    .default("QUARTERLY"),
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "TERM_LOAN",
    "REVOLVING_CREDIT",
    "DISCOUNT_LINE",
    "CONFIRMING",
    "FINANCE_LEASE",
    "OVERDRAFT",
    "GUARANTEE",
  ]),
  bankEntityName: z.string().min(1),
  principalAmount: z.number().positive(),
  interestRateType: z.enum(["FIXED", "VARIABLE"]),
  interestRateValue: z.number().min(0),
  referenceRate: z.string().optional(),
  spread: z.number().optional(),
  startDate: z.string(),
  maturityDate: z.string(),
  paymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ON_DEMAND", "BULLET"]),
  creditLimit: z.number().positive().optional(),
  paymentDay: z.number().int().min(1).max(28).optional(),
  gracePeriodEndDate: z.string().optional(),
  contractDocUrl: z.string().optional(),
  bankAccountId: z.string().optional(),
  notes: z.string().optional(),
  schedule: z.array(scheduleEntrySchema).optional(),
  covenants: z.array(covenantSchema).optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Revolving credit requires creditLimit
    const isRevolving =
      data.type === "REVOLVING_CREDIT" ||
      data.type === "OVERDRAFT" ||
      data.type === "DISCOUNT_LINE";
    if (isRevolving && !data.creditLimit) {
      return NextResponse.json(
        { error: "creditLimit es obligatorio para líneas de crédito/descuento/overdraft." },
        { status: 400 }
      );
    }

    // Build schedule entries
    let scheduleEntries: ScheduleEntry[] = [];
    if (data.schedule && data.schedule.length > 0) {
      // User-provided schedule
      scheduleEntries = data.schedule.map((e) => ({
        ...e,
        dueDate: new Date(e.dueDate),
      }));
    } else if (data.type === "TERM_LOAN" || data.type === "FINANCE_LEASE") {
      // Auto-generate French amortization schedule
      const startDate = new Date(data.startDate);
      const maturityDate = new Date(data.maturityDate);
      const termMonths =
        (maturityDate.getFullYear() - startDate.getFullYear()) * 12 +
        (maturityDate.getMonth() - startDate.getMonth());

      let graceMonths = 0;
      if (data.gracePeriodEndDate) {
        const graceEnd = new Date(data.gracePeriodEndDate);
        graceMonths =
          (graceEnd.getFullYear() - startDate.getFullYear()) * 12 +
          (graceEnd.getMonth() - startDate.getMonth());
      }

      if (termMonths > 0) {
        scheduleEntries = generateAmortizationSchedule({
          principal: data.principalAmount,
          annualRate: data.interestRateValue,
          termMonths,
          graceMonths: graceMonths > 0 ? graceMonths : undefined,
          startDate,
          paymentDay: data.paymentDay ?? 5,
        });
      }
    }

    const instrument = await (db as any).debtInstrument.create({
      data: {
        name: data.name,
        type: data.type,
        bankEntityName: data.bankEntityName,
        principalAmount: data.principalAmount,
        outstandingBalance: data.principalAmount,
        interestRateType: data.interestRateType,
        interestRateValue: data.interestRateValue,
        referenceRate: data.referenceRate,
        spread: data.spread,
        startDate: new Date(data.startDate),
        maturityDate: new Date(data.maturityDate),
        gracePeriodEndDate: data.gracePeriodEndDate ? new Date(data.gracePeriodEndDate) : null,
        paymentDay: data.paymentDay,
        paymentFrequency: data.paymentFrequency,
        creditLimit: data.creditLimit ?? null,
        currentDrawdown: isRevolving ? 0 : null,
        contractDocUrl: data.contractDocUrl,
        bankAccountId: data.bankAccountId,
        notes: data.notes,
        ...(scheduleEntries.length > 0
          ? {
              schedule: {
                create: scheduleEntries.map((e) => ({
                  entryNumber: e.entryNumber,
                  dueDate: e.dueDate,
                  principalAmount: e.principalAmount,
                  interestAmount: e.interestAmount,
                  totalAmount: e.totalAmount,
                  outstandingAfter: e.outstandingAfter,
                })),
              },
            }
          : {}),
        ...(data.covenants && data.covenants.length > 0
          ? {
              covenants: {
                create: data.covenants.map((c) => ({
                  name: c.name,
                  metric: c.metric,
                  threshold: c.threshold,
                  operator: c.operator,
                  testFrequency: c.testFrequency,
                })),
              },
            }
          : {}),
      },
      include: { schedule: true, covenants: true },
    });

    return NextResponse.json(instrument, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create debt instrument", err);
  }
});
