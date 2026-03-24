import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";
import { linkDeferredToInvoice } from "@/lib/accounting/deferred-entries";

const applySchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().finite().positive().optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = ctx.params?.id;
      if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }

      const body = await req.json();
      const parsed = applySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      await linkDeferredToInvoice(db, id, parsed.data.invoiceId, parsed.data.amount);

      return NextResponse.json({ success: true });
    } catch (err) {
      return errorResponse("Failed to apply deferred entry", err);
    }
  }
);
