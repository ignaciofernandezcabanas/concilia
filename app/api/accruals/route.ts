import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const createSchema = z.object({
  description: z.string().min(1),
  contactId: z.string().optional(),
  totalAnnualAmount: z.number().finite().positive(),
  monthlyAmount: z.number().finite().positive().optional(),
  expenseAccountCode: z.string().min(3),
  accrualAccountCode: z.string().min(3),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]).default("MONTHLY"),
  startDate: z.string(),
  endDate: z.string().optional(),
  autoReverse: z.boolean().default(true),
});

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RecurringAccrual not yet in ScopedPrisma type
    const accruals = await (db as any).recurringAccrual.findMany({
      where: status
        ? { status: status as "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" }
        : undefined,
      include: {
        contact: { select: { name: true } },
        linkedInvoice: { select: { number: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: accruals });
  } catch (err) {
    return errorResponse("Failed to fetch accruals", err);
  }
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
    const d = parsed.data;
    const monthlyAmount = d.monthlyAmount ?? Math.round((d.totalAnnualAmount / 12) * 100) / 100;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accrual = await (db as any).recurringAccrual.create({
      data: {
        description: d.description,
        contactId: d.contactId,
        totalAnnualAmount: d.totalAnnualAmount,
        monthlyAmount,
        expenseAccountCode: d.expenseAccountCode,
        accrualAccountCode: d.accrualAccountCode,
        frequency: d.frequency,
        startDate: new Date(d.startDate),
        endDate: d.endDate ? new Date(d.endDate) : null,
        autoReverse: d.autoReverse,
      },
    });
    return NextResponse.json(accrual, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create accrual", err);
  }
});
