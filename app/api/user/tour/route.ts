import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: updates User directly (not scoped by company)

export const PATCH = withAuth(async (_req, ctx) => {
  try {
    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { tourCompletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse("Error updating tour status", err);
  }
});
