/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * GET /api/contacts/[id]/people
 *
 * List all people for a contact.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const contactId = ctx.params?.id;
      if (!contactId) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

      // Verify contact belongs to company
      const contact = await db.contact.findFirst({ where: { id: contactId } });
      if (!contact) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      const people = await (db as any).contactPerson.findMany({
        where: { contactId },
        orderBy: { isDefault: "desc" },
      });

      return NextResponse.json(people);
    } catch (err) {
      return errorResponse("Error al listar personas", err);
    }
  }
);

const createPersonSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
});

/**
 * POST /api/contacts/[id]/people
 *
 * Create a new person for a contact. First person is automatically set as default.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const db = ctx.db;
    try {
      const contactId = ctx.params?.id;
      if (!contactId) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

      // Verify contact belongs to company
      const contact = await db.contact.findFirst({ where: { id: contactId } });
      if (!contact) {
        return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      }

      const body = await req.json();
      const parsed = createPersonSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      // Check if this is the first person
      const existingCount = await (db as any).contactPerson.count({ where: { contactId } });
      const isDefault = existingCount === 0;

      const person = await (db as any).contactPerson.create({
        data: {
          contactId,
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone ?? null,
          role: parsed.data.role ?? null,
          isDefault,
        },
      });

      return NextResponse.json(person, { status: 201 });
    } catch (err: any) {
      // Handle unique constraint violation (duplicate email for same contact)
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "Ya existe una persona con ese email para este contacto" },
          { status: 409 }
        );
      }
      return errorResponse("Error al crear persona", err);
    }
  }
);
