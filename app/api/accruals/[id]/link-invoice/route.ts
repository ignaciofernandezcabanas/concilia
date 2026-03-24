import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { linkAccrualToInvoice } from "@/lib/accounting/accruals";
import { z } from "zod";

const schema = z.object({ invoiceId: z.string().min(1) });

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const id = req.nextUrl.pathname.split("/").at(-2)!;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const result = await linkAccrualToInvoice(db, id, parsed.data.invoiceId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to link accrual to invoice", err);
  }
});
