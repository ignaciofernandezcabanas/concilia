import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createAuditLog } from "@/lib/utils/audit";
import { extractInvoiceFromPdf } from "@/lib/invoices/pdf-extractor";
import { uploadInvoiceToDrive } from "@/lib/invoices/upload-to-drive";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * POST /api/invoices/import
 *
 * Imports invoices from uploaded PDF files.
 * Accepts multipart/form-data with multiple "files" fields.
 * Each PDF is analyzed by Claude to extract invoice data.
 *
 * Also stores the PDF locally for visualization.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  const { company, user } = ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba multipart/form-data con archivos PDF." },
      { status: 400 }
    );
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No se encontraron archivos." }, { status: 400 });
  }

  // Ensure upload directory exists
  const uploadDir = join(process.cwd(), "uploads", "invoices", company.id);
  await mkdir(uploadDir, { recursive: true });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const results: { filename: string; number: string | null; status: string }[] = [];

  for (const file of files) {
    const filename = file.name;

    // Only process PDFs
    if (!filename.toLowerCase().endsWith(".pdf")) {
      errors.push(`${filename}: no es un PDF, ignorado`);
      results.push({ filename, number: null, status: "skipped" });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());

      // Extract data with Claude
      const extracted = await extractInvoiceFromPdf(buffer, filename);

      if (!extracted.totalAmount) {
        errors.push(`${filename}: no se pudo extraer el importe total`);
        results.push({ filename, number: extracted.number, status: "error" });
        continue;
      }

      // Check for duplicate by number
      if (extracted.number) {
        const existing = await db.invoice.findFirst({
          where: { companyId: company.id, number: extracted.number },
        });
        if (existing) {
          skipped++;
          results.push({ filename, number: extracted.number, status: "duplicate" });
          continue;
        }
      }

      // Find or create contact
      let contactId: string | null = null;
      if (extracted.supplierName) {
        const existingContact = await db.contact.findFirst({
          where: {
            companyId: company.id,
            OR: [
              { name: { contains: extracted.supplierName, mode: "insensitive" } },
              ...(extracted.supplierCif ? [{ cif: extracted.supplierCif }] : []),
            ],
          },
        });

        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const newContact = await db.contact.create({
            data: {
              name: extracted.supplierName,
              cif: extracted.supplierCif,
              type: extracted.type === "RECEIVED" ? "SUPPLIER" : "CUSTOMER",
              companyId: company.id,
            },
          });
          contactId = newContact.id;
        }
      }

      // Save PDF to disk (local backup)
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const pdfPath = join(uploadDir, `${Date.now()}_${safeName}`);
      await writeFile(pdfPath, buffer);
      const pdfUrl = `/uploads/invoices/${company.id}/${pdfPath.split("/").pop()}`;

      // Upload to Google Drive
      const driveResult = await uploadInvoiceToDrive(
        company.id,
        buffer,
        extracted.number ? `${extracted.number}.pdf` : safeName,
        extracted.type
      );

      // Create invoice
      const invoice = await db.invoice.create({
        data: {
          number: extracted.number || `IMP-${Date.now()}`,
          type: extracted.type,
          issueDate: extracted.issueDate ? new Date(extracted.issueDate) : new Date(),
          dueDate: extracted.dueDate ? new Date(extracted.dueDate) : undefined,
          totalAmount: extracted.totalAmount,
          netAmount: extracted.netAmount,
          vatAmount: extracted.vatAmount,
          currency: extracted.currency,
          description: extracted.description,
          status: "PENDING",
          pdfUrl,
          driveFileId: driveResult?.driveFileId ?? undefined,
          companyId: company.id,
          contactId,
          lines: {
            create: extracted.lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalAmount: line.total,
              vatRate: line.vatRate,
            })),
          },
        },
      });

      created++;
      results.push({ filename, number: invoice.number, status: "created" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${filename}: ${msg}`);
      results.push({ filename, number: null, status: "error" });
    }
  }

  createAuditLog(db, {
    userId: user.id,
    action: "INVOICES_IMPORT",
    entityType: "Invoice",
    entityId: "batch",
    details: { filesCount: files.length, created, skipped, errors: errors.length },
  }).catch((err) =>
    console.warn(
      "[import] Non-critical operation failed:",
      err instanceof Error ? err.message : err
    )
  );

  return NextResponse.json({
    success: true,
    created,
    skipped,
    total: files.length,
    errors: errors.slice(0, 30),
    results,
  });
}, "classify:transaction");
