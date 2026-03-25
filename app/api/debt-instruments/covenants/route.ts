/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

// ---------------------------------------------------------------------------
// GET /api/debt-instruments/covenants
// ---------------------------------------------------------------------------

export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const instruments = await (db as any).debtInstrument.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        covenants: true,
      },
    });

    const covenants = instruments.flatMap((inst: any) =>
      inst.covenants.map((cov: any) => ({
        id: cov.id,
        debtInstrumentId: inst.id,
        debtInstrumentName: inst.name,
        name: cov.name,
        metric: cov.metric,
        threshold: cov.threshold,
        operator: cov.operator,
        testFrequency: cov.testFrequency,
        lastTestedAt: cov.lastTestedAt,
        lastTestedValue: cov.lastTestedValue,
        isCompliant: cov.isCompliant,
        status: cov.isCompliant == null ? "PENDING" : cov.isCompliant ? "OK" : "BREACH",
      }))
    );

    return NextResponse.json({ data: covenants });
  } catch (err) {
    return errorResponse("Failed to list covenants", err);
  }
});
