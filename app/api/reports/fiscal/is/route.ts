import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { calculateModelIS } from "@/lib/reports/fiscal-models";
import { z } from "zod";

const schema = z.object({ year: z.coerce.number().int().min(2020).max(2030) });

/**
 * GET /api/reports/fiscal/is?year=2025
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const params = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!params.success) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }
    const result = await calculateModelIS(db, params.data.year);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to calculate IS", err);
  }
}, "read:reports");
