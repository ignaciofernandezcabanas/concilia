import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/utils/audit";
import { extractInvoiceFromPdf } from "@/lib/invoices/pdf-extractor";
import { uploadInvoiceToDrive } from "@/lib/invoices/upload-to-drive";
import { google } from "googleapis";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { z } from "zod";

const bodySchema = z.object({
  folderId: z.string().min(1, "Google Drive folder ID is required"),
});

/**
 * POST /api/invoices/import-drive
 *
 * Imports all PDFs from a Google Drive folder.
 * Body: { folderId: "..." }
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const { company, user } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "folderId es requerido." }, { status: 400 });
  }

  // Get Google Drive integration config
  const integration = await prisma.integration.findUnique({
    where: { type_companyId: { type: "GOOGLE_DRIVE", companyId: company.id } },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json(
      { error: "Google Drive no está conectado. Configúralo en Ajustes > Integraciones." },
      { status: 400 }
    );
  }

  const config = integration.config as Record<string, string>;
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    return NextResponse.json({ error: "Credenciales de Google Drive incompletas." }, { status: 400 });
  }

  // Authenticate with Google Drive
  const oauth2 = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2.setCredentials({ refresh_token: config.refreshToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  // List PDF files in the folder
  let pdfFiles: { id: string; name: string }[];
  try {
    const res = await drive.files.list({
      q: `'${parsed.data.folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 100,
    });
    pdfFiles = (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
  } catch {
    return NextResponse.json(
      { error: "No se pudo acceder a la carpeta de Drive. Verifica el ID y los permisos." },
      { status: 400 }
    );
  }

  if (pdfFiles.length === 0) {
    return NextResponse.json({ error: "No se encontraron PDFs en la carpeta." }, { status: 400 });
  }

  // Ensure upload directory
  const uploadDir = join(process.cwd(), "uploads", "invoices", company.id);
  await mkdir(uploadDir, { recursive: true });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const results: { filename: string; number: string | null; status: string }[] = [];

  for (const file of pdfFiles) {
    try {
      // Download PDF from Drive
      const res = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);

      // Extract data with Claude
      const extracted = await extractInvoiceFromPdf(buffer, file.name);

      if (!extracted.totalAmount) {
        errors.push(`${file.name}: no se pudo extraer el importe total`);
        results.push({ filename: file.name, number: extracted.number, status: "error" });
        continue;
      }

      // Check duplicate
      if (extracted.number) {
        const existing = await prisma.invoice.findFirst({
          where: { companyId: company.id, number: extracted.number },
        });
        if (existing) {
          skipped++;
          results.push({ filename: file.name, number: extracted.number, status: "duplicate" });
          continue;
        }
      }

      // Find or create contact
      let contactId: string | null = null;
      if (extracted.supplierName) {
        const existingContact = await prisma.contact.findFirst({
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
          const newContact = await prisma.contact.create({
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

      // Save PDF locally
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const pdfPath = join(uploadDir, `${Date.now()}_${safeName}`);
      await writeFile(pdfPath, buffer);
      const pdfUrl = `/uploads/invoices/${company.id}/${pdfPath.split("/").pop()}`;

      // Upload to the configured Drive folder (may be different from source folder)
      const driveUpload = await uploadInvoiceToDrive(
        company.id,
        buffer,
        extracted.number ? `${extracted.number}.pdf` : safeName,
        extracted.type
      );

      await prisma.invoice.create({
        data: {
          number: extracted.number || `DRV-${Date.now()}`,
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
          driveFileId: driveUpload?.driveFileId ?? file.id,
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
      results.push({ filename: file.name, number: extracted.number, status: "created" });
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ filename: file.name, number: null, status: "error" });
    }
  }

  createAuditLog({
    userId: user.id,
    action: "INVOICES_IMPORT_DRIVE",
    entityType: "Invoice",
    entityId: "batch",
    details: { folderId: parsed.data.folderId, filesCount: pdfFiles.length, created, skipped },
  }).catch((err) => console.warn("[import-drive] Non-critical operation failed:", err instanceof Error ? err.message : err));

  return NextResponse.json({ success: true, created, skipped, total: pdfFiles.length, errors: errors.slice(0, 30), results });
}, "classify:transaction");
