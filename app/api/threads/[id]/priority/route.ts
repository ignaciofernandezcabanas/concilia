/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { z } from "zod";

const prioritySchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

/**
 * PUT /api/threads/[id]/priority — Change priority
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const id = req.nextUrl.pathname.split("/").slice(-2)[0]!;
    const body = await req.json();
    const parsed = prioritySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await (db as any).agentThread.update({
      where: { id },
      data: { priority: parsed.data.priority },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse("Failed to update priority", err);
  }
});
