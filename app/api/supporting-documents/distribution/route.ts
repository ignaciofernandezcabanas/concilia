import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createDistributionEntry } from "@/lib/accounting/equity";
import { z } from "zod";

const schema = z.object({
  toReservaLegal: z.number().min(0),
  toReservasVoluntarias: z.number().min(0),
  toDividendos: z.number().min(0),
  toCompensarPerdidas: z.number().min(0),
});

/**
 * POST /api/supporting-documents/distribution
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await createDistributionEntry(ctx.db, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create distribution entry", err);
  }
}, "resolve:reconciliation");
