/**
 * Import invoices from a connected storage folder (Drive/OneDrive).
 *
 * Scans folder for PDFs, extracts data with AI, creates invoices.
 * Dedup by holdedId = "storage:{fileId}".
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { getStorageProvider } from "@/lib/storage";
import { extractInvoiceFromPdf } from "@/lib/invoices/pdf-extractor";

export interface StorageScanResult {
  filesScanned: number;
  pdfsFound: number;
  invoicesImported: number;
  skipped: number;
  errors: Array<{ file: string; error: string }>;
  hasMore: boolean;
}

export async function importInvoicesFromStorage(
  db: ScopedPrisma,
  companyId: string,
  options?: { folderId?: string; maxFiles?: number }
): Promise<StorageScanResult> {
  const result: StorageScanResult = {
    filesScanned: 0,
    pdfsFound: 0,
    invoicesImported: 0,
    skipped: 0,
    errors: [],
    hasMore: false,
  };

  const storageProvider = await getStorageProvider(db);
  if (!storageProvider) return result;

  const folderId = options?.folderId ?? "root";
  const maxFiles = options?.maxFiles ?? 100;

  const files = await storageProvider.listFiles(folderId);
  result.filesScanned = files.length;

  // Filter PDFs
  const pdfs = files.filter(
    (f) => f.mimeType === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );
  result.pdfsFound = pdfs.length;

  let processed = 0;

  for (const file of pdfs) {
    if (processed >= maxFiles) {
      result.hasMore = true;
      break;
    }

    const holdedId = `storage:${file.id}`;

    // Dedup
    const existing = await db.invoice.findFirst({
      where: { holdedId },
    });

    if (existing) {
      result.skipped++;
      processed++;
      continue;
    }

    try {
      const buffer = await storageProvider.downloadFile(file.id);
      const extracted = await extractInvoiceFromPdf(buffer, file.name);

      if ((extracted.confidence ?? 0) < 0.5) {
        result.errors.push({
          file: file.name,
          error: `Low confidence: ${Math.round((extracted.confidence ?? 0) * 100)}%`,
        });
        processed++;
        continue;
      }

      // Upsert contact
      let contactId: string | null = null;
      if (extracted.supplierName) {
        const contact = await (db as any).contact.upsert({
          where: {
            holdedId_companyId: {
              holdedId: `storage:${extracted.supplierCif ?? extracted.supplierName}`,
              companyId,
            },
          },
          create: {
            holdedId: `storage:${extracted.supplierCif ?? extracted.supplierName}`,
            name: extracted.supplierName,
            cif: extracted.supplierCif,
            type: extracted.type === "ISSUED" ? "CUSTOMER" : "SUPPLIER",
            companyId,
          },
          update: { name: extracted.supplierName },
        });
        contactId = contact.id;
      }

      await db.invoice.create({
        data: {
          holdedId,
          number: extracted.number ?? `DRIVE-${file.id.slice(0, 8)}`,
          type: extracted.type === "ISSUED" ? "ISSUED" : "RECEIVED",
          issueDate: extracted.issueDate ? new Date(extracted.issueDate) : new Date(),
          dueDate: extracted.dueDate ? new Date(extracted.dueDate) : null,
          totalAmount: extracted.totalAmount ?? 0,
          netAmount: extracted.netAmount ?? extracted.totalAmount ?? 0,
          vatAmount: extracted.vatAmount ?? 0,
          currency: extracted.currency ?? "EUR",
          description: extracted.description ?? file.name,
          status: "PENDING",
          amountPaid: 0,
          amountPending: extracted.totalAmount ?? 0,
          driveFileId: file.id,
          contactId,
          companyId,
        } as any,
      });

      result.invoicesImported++;
    } catch (err) {
      result.errors.push({
        file: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    processed++;
  }

  return result;
}
