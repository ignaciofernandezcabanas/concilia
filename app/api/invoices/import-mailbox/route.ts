import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { importInvoicesFromMailbox } from "@/lib/invoices/import-from-mailbox";
import { errorResponse } from "@/lib/utils/error-response";

/**
 * POST /api/invoices/import-mailbox
 *
 * Triggers manual import from the company's dedicated invoice mailbox.
 */
export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const db = ctx.db;
  try {
    const result = await importInvoicesFromMailbox(db, ctx.company.id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse("Failed to import from mailbox.", err);
  }
}, "resolve:reconciliation");
