import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { importInvoicesFromStorage } from "@/lib/invoices/import-from-storage";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * POST /api/invoices/import-storage
 * Body: { folderId?: string }
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const db = ctx.db;
    try {
      const body = await req.json().catch(() => ({}));
      const result = await importInvoicesFromStorage(db, ctx.company.id, {
        folderId: (body as Record<string, unknown>).folderId as string | undefined,
      });
      return NextResponse.json(result);
    } catch (err) {
      return errorResponse("Failed to import from storage.", err);
    }
  },
  "resolve:reconciliation"
);
