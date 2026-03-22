import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { resolveItem, type ResolvePayload } from "@/lib/reconciliation/resolver";
import { z } from "zod";

const batchSchema = z.object({
  items: z.array(
    z.object({
      action: z.enum([
        "approve",
        "reject",
        "classify",
        "mark_internal",
        "mark_intercompany",
        "mark_duplicate",
        "mark_return",
        "ignore",
      ]),
      reconciliationId: z.string().optional(),
      bankTransactionId: z.string().optional(),
      accountCode: z.string().optional(),
      cashflowType: z.string().optional(),
      reason: z.string().optional(),
      createRule: z.boolean().optional(),
    })
  ).min(1).max(100),
});

/**
 * POST /api/reconciliation/batch-resolve
 *
 * Resolves multiple reconciliation items in one request.
 * Each item is processed independently — partial failures are reported.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json();
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const results: Array<{
      index: number;
      success: boolean;
      action: string;
      message: string;
      error?: string;
    }> = [];

    for (let i = 0; i < parsed.data.items.length; i++) {
      const item = parsed.data.items[i];
      try {
        const payload: ResolvePayload = {
          action: item.action as ResolvePayload["action"],
          reconciliationId: item.reconciliationId,
          bankTransactionId: item.bankTransactionId,
          accountCode: item.accountCode,
          cashflowType: item.cashflowType as ResolvePayload["cashflowType"],
          reason: item.reason,
          createRule: item.createRule,
        };

        const result = await resolveItem(payload, ctx.user.id, ctx.company.id);
        results.push({
          index: i,
          success: result.success,
          action: item.action,
          message: result.message,
        });
      } catch (err) {
        results.push({
          index: i,
          success: false,
          action: item.action,
          message: "Error processing item.",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: failed === 0,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  },
  "resolve:reconciliation"
);
