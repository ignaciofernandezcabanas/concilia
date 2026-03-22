import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { resolveSchema } from "@/lib/utils/validation";
import { resolveItem, type ResolvePayload } from "@/lib/reconciliation/resolver";

/**
 * POST /api/reconciliation/[id]/resolve
 *
 * Thin route handler — validates input and delegates ALL business logic
 * to resolveItem() in lib/reconciliation/resolver.ts.
 *
 * NO direct Prisma writes here. Everything runs inside a $transaction
 * in the resolver.
 */
export const POST = withAuth(
  async (
    req: NextRequest,
    ctx: AuthContext & { params?: Record<string, string> }
  ) => {
    const { user, company, params } = ctx;
    const reconciliationId = params?.id;

    if (!reconciliationId) {
      return NextResponse.json(
        { error: "Reconciliation ID is required." },
        { status: 400 }
      );
    }

    // ── Parse and validate input ──
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // ── Map Zod-validated input to resolver payload ──
    const payload: ResolvePayload = {
      action: input.action as ResolvePayload["action"],
      reconciliationId:
        "reconciliationId" in input ? input.reconciliationId : reconciliationId,
      bankTransactionId:
        "bankTransactionId" in input ? input.bankTransactionId : undefined,
      invoiceId: "invoiceId" in input ? input.invoiceId : undefined,
      differenceReason:
        "differenceReason" in input
          ? (input.differenceReason as ResolvePayload["differenceReason"])
          : undefined,
      differenceAccountId:
        "differenceAccountId" in input
          ? input.differenceAccountId
          : undefined,
      accountCode: "accountCode" in input ? input.accountCode : undefined,
      cashflowType:
        "cashflowType" in input
          ? (input.cashflowType as ResolvePayload["cashflowType"])
          : undefined,
      description: "description" in input ? input.description : undefined,
      reason: "reason" in input ? input.reason : undefined,
      duplicateOfId:
        "duplicateOfId" in input ? input.duplicateOfId : undefined,
      duplicateGroupId:
        "duplicateGroupId" in input ? input.duplicateGroupId : undefined,
      note: "note" in input ? (input as Record<string, string>).note : undefined,
    };

    // ── Delegate to resolver ──
    try {
      const result = await resolveItem(payload, user.id, company.id);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[reconciliation/resolve] Error:", err);
      return NextResponse.json(
        {
          error: "Failed to resolve reconciliation.",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }
  },
  "resolve:reconciliation"
);
