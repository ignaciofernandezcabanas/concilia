import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";
import { addControllerMessage } from "@/lib/threads/thread-manager";

const messageSchema = z.object({
  message: z.string().min(1).max(5000),
  actionTaken: z.string().optional(),
});

/**
 * POST /api/threads/[id]/messages — Controller sends message or takes action
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const id = req.nextUrl.pathname.split("/").slice(-2)[0]!;
    const body = await req.json();
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await addControllerMessage(db, id, parsed.data.message, parsed.data.actionTaken);

    return NextResponse.json({ data: result });
  } catch (err) {
    return errorResponse("Failed to add message", err);
  }
});
