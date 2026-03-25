import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { parseInvoiceExcel } from "@/lib/invoices/excel-parser";
import { errorResponse } from "@/lib/utils/error-response";

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = await parseInvoiceExcel(buffer);

    let imported = 0;
    for (const row of rows) {
      let contactId: string | null = null;
      if (row.contactName) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contact = await (db as any).contact.upsert({
          where: {
            holdedId_companyId: {
              holdedId: `excel:${row.contactCif ?? row.contactName}`,
              companyId: ctx.company.id,
            },
          },
          create: {
            holdedId: `excel:${row.contactCif ?? row.contactName}`,
            name: row.contactName,
            cif: row.contactCif,
            type: row.type === "ISSUED" ? "CUSTOMER" : "SUPPLIER",
            companyId: ctx.company.id,
          },
          update: { name: row.contactName },
        });
        contactId = contact.id;
      }

      await db.invoice.create({
        data: {
          number: row.number,
          type: row.type,
          issueDate: row.issueDate,
          totalAmount: row.totalAmount,
          netAmount: row.netAmount ?? row.totalAmount,
          vatAmount: row.vatAmount ?? 0,
          currency: "EUR",
          status: "PENDING",
          amountPaid: 0,
          amountPending: row.totalAmount,
          contactId,
          companyId: ctx.company.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      imported++;
    }

    return NextResponse.json({
      success: true,
      imported,
      errors,
      total: rows.length + errors.length,
    });
  } catch (err) {
    return errorResponse("Error al importar facturas.", err);
  }
}, "resolve:reconciliation");
