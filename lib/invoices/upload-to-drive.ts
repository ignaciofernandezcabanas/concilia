/**
 * Uploads an invoice PDF to the configured Google Drive folder.
 * Returns the Drive file ID, or null if Drive is not configured.
 */

import { prisma } from "@/lib/db";
import { google } from "googleapis";
import { Readable } from "stream";

export async function uploadInvoiceToDrive(
  companyId: string,
  pdfBuffer: Buffer,
  filename: string,
  invoiceType: "ISSUED" | "RECEIVED"
): Promise<{ driveFileId: string; webViewLink: string } | null> {
  // Get Google Drive integration
  const integration = await prisma.integration.findUnique({
    where: { type_companyId: { type: "GOOGLE_DRIVE", companyId } },
  });

  if (!integration || integration.status !== "CONNECTED") return null;

  const config = integration.config as Record<string, unknown>;
  const clientId = config.clientId as string;
  const clientSecret = config.clientSecret as string;
  const refreshToken = config.refreshToken as string;
  const rootFolderId = config.rootFolderId as string | undefined;
  const separateIssuedReceived = config.separateIssuedReceived !== false;

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });

    // Determine target folder
    let targetFolderId = rootFolderId || undefined;

    // Create or find "Facturas" subfolder if root is set
    if (targetFolderId) {
      targetFolderId = await ensureFolder(drive, "Facturas", targetFolderId);

      // Optionally separate by type
      if (separateIssuedReceived) {
        const subName = invoiceType === "ISSUED" ? "Emitidas" : "Recibidas";
        targetFolderId = await ensureFolder(drive, subName, targetFolderId);
      }

      // Create year-month subfolder
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      targetFolderId = await ensureFolder(drive, yearMonth, targetFolderId);
    }

    // Upload the file
    const res = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: "application/pdf",
        ...(targetFolderId ? { parents: [targetFolderId] } : {}),
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from(pdfBuffer),
      },
      fields: "id, webViewLink",
    });

    return {
      driveFileId: res.data.id!,
      webViewLink: res.data.webViewLink || "",
    };
  } catch (err) {
    console.error("[uploadInvoiceToDrive] Error:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  // Check if folder exists
  const existing = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });

  if (existing.data.files?.length) {
    return existing.data.files[0].id!;
  }

  // Create folder
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return created.data.id!;
}
