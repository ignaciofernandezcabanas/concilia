/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/bad-debts?status=MONITORING
 *
 * List bad debt trackers, optionally filtered by status.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const status = req.nextUrl.searchParams.get("status");

  try {
    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const trackers = await (db as any).badDebtTracker.findMany({
      where,
      include: {
        invoice: {
          select: {
            number: true,
            totalAmount: true,
            amountPaid: true,
            dueDate: true,
            contact: { select: { name: true, cif: true } },
          },
        },
      },
      orderBy: { overdueMonths: "desc" },
    });

    return NextResponse.json({ data: trackers, count: trackers.length });
  } catch (err) {
    return errorResponse("Failed to list bad debt trackers.", err, 500);
  }
}, "read:reports");

/**
 * PUT /api/bad-debts
 *
 * Update claim info on a bad debt tracker.
 */
const updateSchema = z.object({
  id: z.string(),
  claimType: z.enum(["BUROFAX", "JUDICIAL", "NOTARIAL", "DEBTOR_INSOLVENCY"]).optional(),
  claimDate: z.string().datetime().optional(),
  claimReference: z.string().optional(),
  status: z
    .enum(["MONITORING", "PROVISION_ACCOUNTING", "PROVISION_TAX", "RECOVERED", "WRITTEN_OFF"])
    .optional(),
});

export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, claimDate, ...rest } = parsed.data;

  try {
    const updated = await (db as any).badDebtTracker.update({
      where: { id },
      data: {
        ...rest,
        ...(claimDate ? { claimDate: new Date(claimDate) } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse("Failed to update bad debt tracker.", err, 500);
  }
}, "resolve:reconciliation");
