import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import { join } from "path";

/**
 * GET /api/invoices/[id]/pdf
 *
 * Serves the PDF file for a given invoice.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const invoiceId = ctx.params?.id;
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required." }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId: ctx.company.id },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
    }

    if (!invoice.pdfUrl) {
      return NextResponse.json({ error: "Esta factura no tiene PDF asociado." }, { status: 404 });
    }

    try {
      const filePath = join(process.cwd(), invoice.pdfUrl);
      const buffer = await readFile(filePath);

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
        },
      });
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo PDF." }, { status: 500 });
    }
  },
  "read:invoices"
);
