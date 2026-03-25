/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * POST /api/contacts/[id]/people/[personId]/set-default
 *
 * Set a contact person as the default for follow-ups.
 * Unsets any previous default for the same contact.
 */
export const POST = withAuth(
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

      // Unset previous default
      await (db as any).contactPerson.updateMany({
        where: { contactId, isDefault: true },
        data: { isDefault: false },
      });

      // Set new default
      const updated = await (db as any).contactPerson.update({
        where: { id: personId },
        data: { isDefault: true },
      });

      return NextResponse.json(updated);
    } catch (err) {
      return errorResponse("Error al establecer persona predeterminada", err);
    }
  }
);
