/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkGestoriaAccess } from "@/lib/auth/gestoria-check";

/**
 * GET /api/gestoria/incidents
 *
 * Lists gestoría-related incidents (notifications of type GESTORIA_INCIDENT).
 */
export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;

    const config = await checkGestoriaAccess(db);
    if (!config) {
      return NextResponse.json({ error: "Gestoría no configurada." }, { status: 403 });
    }

    const incidents = await db.notification.findMany({
      where: { type: "GESTORIA_INCIDENT" as any },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ incidents });
  } catch (err) {
    return errorResponse("Error listing gestoría incidents", err);
  }
});

/**
 * POST /api/gestoria/incidents
 *
 * Creates a new gestoría incident. Creates a notification for the controller.
 */
const createIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;

    const config = await checkGestoriaAccess(db);
    if (!config) {
      return NextResponse.json({ error: "Gestoría no configurada." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, description, severity } = parsed.data;

    const notification = await db.notification.create({
      data: {
        type: "GESTORIA_INCIDENT" as any,
        title: `[${severity.toUpperCase()}] ${title}`,
        body: `${config.gestoriaName ?? "Gestoría"}: ${description}`,
        userId: ctx.user.id,
        companyId: ctx.company.id,
        metadata: { severity, gestoriaName: config.gestoriaName } as any,
      },
    });

    return NextResponse.json({ success: true, incident: notification }, { status: 201 });
  } catch (err) {
    return errorResponse("Error creating gestoría incident", err);
  }
});
