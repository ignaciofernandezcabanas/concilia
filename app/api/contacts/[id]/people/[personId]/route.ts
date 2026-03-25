/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

const updatePersonSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
});

/**
 * PUT /api/contacts/[id]/people/[personId]
 *
 * Update an existing contact person.
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const contactId = ctx.params?.id;
      const personId = ctx.params?.personId;
      if (!contactId || !personId) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 });
      }

      // Verify contact belongs to company
      const contact = await db.contact.findFirst({ where: { id: contactId } });
      if (!contact) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      const existing = await (db as any).contactPerson.findFirst({
        where: { id: personId, contactId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
      }

      const body = await req.json();
      const parsed = updatePersonSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updated = await (db as any).contactPerson.update({
        where: { id: personId },
        data: parsed.data,
      });

      return NextResponse.json(updated);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "Ya existe una persona con ese email para este contacto" },
          { status: 409 }
        );
      }
      return errorResponse("Error al actualizar persona", err);
    }
  }
);

/**
 * DELETE /api/contacts/[id]/people/[personId]
 *
 * Delete a contact person. Blocks if it's the only default person.
 */
export const DELETE = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const contactId = ctx.params?.id;
      const personId = ctx.params?.personId;
      if (!contactId || !personId) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 });
      }

      // Verify contact belongs to company
      const contact = await db.contact.findFirst({ where: { id: contactId } });
      if (!contact) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      const person = await (db as any).contactPerson.findFirst({
        where: { id: personId, contactId },
      });
      if (!person) {
        return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
      }

      // Block deletion if it's the default and only person
      if (person.isDefault) {
        const totalCount = await (db as any).contactPerson.count({ where: { contactId } });
        if (totalCount <= 1) {
          return NextResponse.json(
            { error: "No se puede eliminar la unica persona de contacto predeterminada" },
            { status: 409 }
          );
        }
      }

      await (db as any).contactPerson.delete({ where: { id: personId } });

      return NextResponse.json({ success: true });
    } catch (err) {
      return errorResponse("Error al eliminar persona", err);
    }
  }
);
