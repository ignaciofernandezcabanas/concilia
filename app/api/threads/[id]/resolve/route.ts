/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * POST /api/threads/[id]/resolve — Manual resolve
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const id = req.nextUrl.pathname.split("/").slice(-2)[0]!;

    await (db as any).agentThread.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        autoResolved: false,
        lastActivityAt: new Date(),
      },
    });

    await (db as any).threadMessage.create({
      data: {
        threadId: id,
        role: "SYSTEM",
        channel: "APP",
        content: "Hilo resuelto manualmente por el controller.",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse("Failed to resolve thread", err);
  }
});
