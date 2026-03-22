import { errorResponse } from "@/lib/utils/error-response";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { resolveItem, type ResolvePayload } from "@/lib/reconciliation/resolver";

/**
 * POST /api/transactions/[id]/action
 *
 * Actions that operate directly on a BankTransaction (no existing Reconciliation):
 * classify, mark_internal, ignore, mark_duplicate, mark_legitimate, manual_match
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext & { params?: Record<string, string> }) => {
    const txId = ctx.params?.id;
    if (!txId) {
      return NextResponse.json({ error: "Transaction ID required." }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const action = body.action as string;
    if (!action) {
      return NextResponse.json({ error: "Action required." }, { status: 400 });
    }

    const payload: ResolvePayload = {
      action: action as ResolvePayload["action"],
      bankTransactionId: txId,
      invoiceId: body.invoiceId as string | undefined,
      accountCode: body.accountCode as string | undefined,
      cashflowType: body.cashflowType as ResolvePayload["cashflowType"],
      description: body.description as string | undefined,
      reason: body.reason as string | undefined,
      duplicateOfId: body.duplicateOfId as string | undefined,
      duplicateGroupId: body.duplicateGroupId as string | undefined,
      differenceReason: body.differenceReason as ResolvePayload["differenceReason"],
      createRule: body.createRule as boolean | undefined,
      note: body.note as string | undefined,
    };

    try {
      const result = await resolveItem(payload, ctx.user.id, ctx.company.id);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[transactions/action] Error:", err);
      return errorResponse("Action failed.", err, 500);
    }
  },
  "resolve:reconciliation"
);
