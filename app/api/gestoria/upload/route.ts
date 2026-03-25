/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { checkGestoriaAccess } from "@/lib/auth/gestoria-check";
import { callAIJson } from "@/lib/ai/model-router";
import { GESTORIA_PROCESS_UPLOAD } from "@/lib/ai/prompt-registry";

/**
 * POST /api/gestoria/upload
 *
 * Accepts a file upload from the gestoría, classifies it using AI,
 * stores a reference, and creates a notification for the controller.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const db = ctx.db;

    const config = await checkGestoriaAccess(db);
    if (!config) {
      return NextResponse.json({ error: "Gestoría no configurada." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const filename = file.name;
    const sizeBytes = file.size;

    // Classify the document using AI
    const classification = await callAIJson(
      "gestoria_process_upload",
      GESTORIA_PROCESS_UPLOAD.system,
      GESTORIA_PROCESS_UPLOAD.buildUser({ filename }),
      GESTORIA_PROCESS_UPLOAD.schema
    );

    // Update lastUploadAt
    await (db as any).gestoriaConfig?.update?.({
      where: { id: config.id },
      data: { lastUploadAt: new Date() },
    });

    // Create notification for controller
    await db.notification.create({
      data: {
        type: "GESTORIA_UPLOAD" as any,
        title: `Documento subido por gestoría: ${filename}`,
        body: `${config.gestoriaName ?? "Gestoría"} ha subido ${filename} (${formatSize(sizeBytes)}). Tipo: ${classification?.documentType ?? "desconocido"}. Periodo: ${classification?.period ?? "no detectado"}.`,
        userId: ctx.user.id,
        companyId: ctx.company.id,
      },
    });

    return NextResponse.json({
      success: true,
      filename,
      sizeBytes,
      classification: classification ?? { documentType: "unknown", confidence: 0 },
    });
  } catch (err) {
    return errorResponse("Error processing gestoría upload", err);
  }
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
