/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * POST /api/bank-accounts/[id]/deactivate
 * Set isActive=false.
 */
export const POST = withAuth(
  async (_req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    try {
      const db = ctx.db;
      const id = ctx.params?.id;
      if (!id) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 });
      }

      const account = await (db as any).ownBankAccount.findFirst({
        where: { id },
      });
      if (!account) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }

      if (!account.isActive) {
        return NextResponse.json({ error: "La cuenta ya está desactivada" }, { status: 400 });
      }

      const updated = await (db as any).ownBankAccount.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json(updated);
    } catch (err) {
      return errorResponse("Error al desactivar cuenta bancaria", err);
    }
  },
  "manage:settings"
);
