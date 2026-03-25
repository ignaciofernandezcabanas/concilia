/**
 * Quarterly invoice archiver for Google Drive.
 *
 * Downloads invoice PDFs from Holded and uploads them to a structured
 * folder hierarchy in Google Drive, organized by quarter and type
 * (emitidas / recibidas).
 */

import { prisma } from "@/lib/db";
import { HoldedClient } from "@/lib/holded/client";
import { GoogleDriveClient, type DriveClientConfig } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchiveQuarterResult {
  issuedCount: number;
  receivedCount: number;
  errorCount: number;
  errors: Array<{ invoiceId: string; invoiceNumber: string; error: string }>;
}

interface DriveIntegrationConfig {
  rootFolderId: string;
  subfolderFormat: string; // e.g. "YYYY-QN"
  separateByType: boolean; // create emitidas/recibidas subfolders
  drive: DriveClientConfig;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Archive all invoices for a given quarter to Google Drive.
 *
 * @param companyId - Company identifier.
 * @param quarter   - Quarter string, e.g. "2026-Q1".
 */
export async function archiveQuarter(
  companyId: string,
  quarter: string
): Promise<ArchiveQuarterResult> {
  const result: ArchiveQuarterResult = {
    issuedCount: 0,
    receivedCount: 0,
    errorCount: 0,
    errors: [],
  };

  // Load integration configs
  const [driveIntegration, holdedIntegration] = await Promise.all([
    prisma.integration.findUnique({
      where: { type_companyId: { type: "GOOGLE_DRIVE", companyId } },
    }),
    prisma.integration.findUnique({
      where: { type_companyId: { type: "HOLDED", companyId } },
    }),
  ]);

  if (!driveIntegration?.config || driveIntegration.status !== "CONNECTED") {
    throw new Error("Google Drive integration is not connected");
  }
  if (!holdedIntegration?.config || holdedIntegration.status !== "CONNECTED") {
    throw new Error("Holded integration is not connected");
  }

  const driveConfig = driveIntegration.config as unknown as DriveIntegrationConfig;
  const holdedConfig = holdedIntegration.config as { apiKey: string };

  const driveClient = new GoogleDriveClient(driveConfig.drive);
  const holdedClient = new HoldedClient(holdedConfig.apiKey);

  // Determine date range from quarter string
  const { startDate, endDate } = parseQuarter(quarter);

  // Fetch invoices in this quarter that don't already have a driveFileId
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      issueDate: { gte: startDate, lte: endDate },
      holdedId: { not: null },
      driveFileId: null,
    },
    orderBy: { issueDate: "asc" },
  });

  if (invoices.length === 0) {
    console.log(`[archiveQuarter] No invoices to archive for ${quarter}`);
    await writeArchiveLog(companyId, quarter, "success", result);
    return result;
  }

  // Create folder structure
  const subfolderName = driveConfig.subfolderFormat
    ? formatSubfolderName(driveConfig.subfolderFormat, quarter)
    : quarter;

  const quarterFolder = await driveClient.ensureFolder(subfolderName, driveConfig.rootFolderId);

  let issuedFolderId = quarterFolder.id;
  let receivedFolderId = quarterFolder.id;

  if (driveConfig.separateByType) {
    const [issuedFolder, receivedFolder] = await Promise.all([
      driveClient.ensureFolder("Emitidas", quarterFolder.id),
      driveClient.ensureFolder("Recibidas", quarterFolder.id),
    ]);
    issuedFolderId = issuedFolder.id;
    receivedFolderId = receivedFolder.id;
  }

  // Process each invoice
  for (const invoice of invoices) {
    try {
      if (!invoice.holdedId) continue;

      // Download PDF from Holded
      const pdfResponse = await holdedClient.getInvoicePdf(invoice.holdedId);
      const pdfBuffer = Buffer.from(pdfResponse.data, "base64");

      // Determine target folder
      const isIssued = invoice.type === "ISSUED" || invoice.type === "CREDIT_ISSUED";
      const targetFolderId = isIssued ? issuedFolderId : receivedFolderId;

      // Upload to Drive
      const fileName = buildFileName(invoice.number, invoice.issueDate);
      const driveFile = await driveClient.uploadFile(
        fileName,
        pdfBuffer,
        "application/pdf",
        targetFolderId
      );

      // Update invoice with Drive file ID
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { driveFileId: driveFile.id },
      });

      if (isIssued) {
        result.issuedCount++;
      } else {
        result.receivedCount++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[archiveQuarter] Error archiving invoice ${invoice.number}: ${message}`);
      result.errors.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        error: message,
      });
      result.errorCount++;
    }
  }

  const status = result.errorCount === 0 ? "success" : "partial";
  await writeArchiveLog(companyId, quarter, status, result);

  console.log(
    `[archiveQuarter] company=${companyId} quarter=${quarter} issued=${result.issuedCount} received=${result.receivedCount} errors=${result.errorCount}`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseQuarter(quarter: string): {
  startDate: Date;
  endDate: Date;
} {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) {
    throw new Error(`Invalid quarter format: "${quarter}". Expected "YYYY-QN" (e.g. "2026-Q1").`);
  }

  const year = parseInt(match[1], 10);
  const q = parseInt(match[2], 10);
  const startMonth = (q - 1) * 3; // 0-indexed: Q1=0, Q2=3, Q3=6, Q4=9

  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);

  return { startDate, endDate };
}

function formatSubfolderName(format: string, quarter: string): string {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return quarter;

  return format.replace("YYYY", match[1]).replace("QN", `Q${match[2]}`).replace("N", match[2]);
}

function buildFileName(invoiceNumber: string, issueDate: Date): string {
  const dateStr = issueDate.toISOString().split("T")[0];
  // Sanitize invoice number for use as a filename
  const safeNumber = invoiceNumber.replace(/[/\\:*?"<>|]/g, "-");
  return `${dateStr}_${safeNumber}.pdf`;
}

async function writeArchiveLog(
  companyId: string,
  quarter: string,
  status: string,
  result: ArchiveQuarterResult
): Promise<void> {
  await prisma.archiveLog.create({
    data: {
      companyId,
      quarter,
      status,
      issuedCount: result.issuedCount,
      receivedCount: result.receivedCount,
      errorCount: result.errorCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
      completedAt: new Date(),
    },
  });
}
