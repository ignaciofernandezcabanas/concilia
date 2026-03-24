import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { createRegularizationEntry } from "@/lib/accounting/equity";
import { z } from "zod";

const schema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
});

/**
 * POST /api/supporting-documents/regularization
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

    const result = await createRegularizationEntry(ctx.db, parsed.data.fiscalYear);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse("Failed to create regularization entry", err);
  }
}, "resolve:reconciliation");
