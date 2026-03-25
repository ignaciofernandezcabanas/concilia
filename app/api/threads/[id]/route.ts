/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/threads/[id] — Full thread with messages
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const id = req.nextUrl.pathname.split("/").pop()!;

    const thread = await (db as any).agentThread.findUniqueOrThrow({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ data: thread });
  } catch (err) {
    return errorResponse("Failed to get thread", err);
  }
});
