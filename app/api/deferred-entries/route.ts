/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";
import { registerAdvance } from "@/lib/accounting/deferred-entries";

const createSchema = z.object({
  type: z.enum(["ADVANCE_RECEIVED", "ADVANCE_PAID"]),
  contactId: z.string().min(1),
  amount: z.number().finite().positive(),
  date: z.string(),
  description: z.string().optional(),
  bankTransactionId: z.string().optional(),
});

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DeferredEntry not yet in ScopedPrisma type
    const entries = await (db as any).deferredEntry.findMany({
      where: status
        ? {
            status: status as "PENDING" | "PARTIALLY_APPLIED" | "FULLY_APPLIED" | "CANCELLED",
          }
        : undefined,
      include: {
        contact: { select: { name: true } },
        linkedInvoice: { select: { number: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: entries });
  } catch (err) {
    return errorResponse("Failed to fetch deferred entries", err);
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

    const result = await registerAdvance(db, {
      type: d.type,
      contactId: d.contactId,
      amount: d.amount,
      date: new Date(d.date),
      description: d.description,
      bankTransactionId: d.bankTransactionId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create deferred entry", err);
  }
});
