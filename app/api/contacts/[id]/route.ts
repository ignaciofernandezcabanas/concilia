/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";
import { normalizeNif } from "@/lib/contacts/utils";

/**
 * GET /api/contacts/[id]
 *
 * Full contact detail with recent invoices and related counts.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = ctx.params?.id;
      if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

      const contact = await db.contact.findUnique({
        where: { id },
        include: {
          people: { orderBy: { isDefault: "desc" } },
          invoices: {
            orderBy: { issueDate: "desc" },
            take: 10,
            select: {
              id: true,
              number: true,
              type: true,
              issueDate: true,
              totalAmount: true,
              status: true,
            },
          },
          _count: {
            select: {
              invoices: true,
              inquiries: true,
              recurringAccruals: true,
            },
          },
        },
      });

      if (!contact) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      return NextResponse.json(contact);
    } catch (err) {
      return errorResponse("Error al obtener contacto", err);
    }
  }
);

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  cif: z.string().optional().nullable(),
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
  email: z.string().email().optional().nullable(),
  iban: z.string().optional().nullable(),
  accountingEmail: z.string().email().optional().nullable(),
  accountingContact: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
});

/**
 * PUT /api/contacts/[id]
 *
 * Update an existing contact.
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = ctx.params?.id;
      if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

      const existing = await db.contact.findFirst({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      const body = await req.json();
      const parsed = updateContactSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const data = parsed.data;

      // Normalize CIF if provided
      const updateData: Record<string, any> = { ...data };
      if ("cif" in data) {
        updateData.cif = normalizeNif(data.cif ?? null);

        // Check duplicate CIF (if changed)
        if (updateData.cif && updateData.cif !== (existing as any).cif) {
          const dup = await db.contact.findFirst({
            where: { cif: updateData.cif, id: { not: id } },
          });
          if (dup) {
            return NextResponse.json(
              { error: `Ya existe un contacto con CIF ${updateData.cif}` },
              { status: 409 }
            );
          }
        }
      }

      const updated = await db.contact.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json(updated);
    } catch (err) {
      return errorResponse("Error al actualizar contacto", err);
    }
  }
);

/**
 * DELETE /api/contacts/[id]
 *
 * Delete a contact. Prevents deletion if linked invoices exist.
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const id = ctx.params?.id;
      if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

      const contact = await db.contact.findFirst({
        where: { id },
        include: { _count: { select: { invoices: true } } },
      });

      if (!contact) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      if ((contact as any)._count?.invoices > 0) {
        return NextResponse.json(
          { error: "No se puede eliminar un contacto con facturas asociadas" },
          { status: 409 }
        );
      }

      await db.contact.delete({ where: { id } });

      return NextResponse.json({ success: true });
    } catch (err) {
      return errorResponse("Error al eliminar contacto", err);
    }
  }
);
