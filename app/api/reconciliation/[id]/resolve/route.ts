import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { resolveSchema } from "@/lib/utils/validation";
import { createAuditLog } from "@/lib/utils/audit";
import { trackControllerDecision } from "@/lib/reconciliation/decision-tracker";

/**
 * POST /api/reconciliation/[id]/resolve
 *
 * Resolves a reconciliation item. Supports multiple actions:
 * approve, reject, manual_match, classify, mark_internal,
 * ignore, mark_duplicate, mark_legitimate.
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

    try {
      switch (input.action) {
        case "approve": {
          const reconciliation = await prisma.reconciliation.findFirst({
            where: { id: input.reconciliationId, companyId: company.id },
            include: {
              bankTransaction: true,
              invoice: true,
            },
          });

          if (!reconciliation) {
            return NextResponse.json(
              { error: "Reconciliation not found." },
              { status: 404 }
            );
          }

          await prisma.reconciliation.update({
            where: { id: reconciliation.id },
            data: {
              status: "APPROVED",
              resolvedAt: new Date(),
              resolvedById: user.id,
            },
          });

          // Update bank transaction status
          if (reconciliation.bankTransactionId) {
            await prisma.bankTransaction.update({
              where: { id: reconciliation.bankTransactionId },
              data: { status: "RECONCILED" },
            });
          }

          // Update invoice as paid (or partial)
          if (reconciliation.invoiceId && reconciliation.invoice) {
            const bankAmount = reconciliation.bankAmount ?? 0;
            const newPaid =
              reconciliation.invoice.amountPaid + bankAmount;
            const isPaid = newPaid >= reconciliation.invoice.totalAmount - 0.01;

            await prisma.invoice.update({
              where: { id: reconciliation.invoiceId },
              data: {
                amountPaid: newPaid,
                amountPending: Math.max(
                  0,
                  reconciliation.invoice.totalAmount - newPaid
                ),
                status: isPaid ? "PAID" : "PARTIAL",
              },
            });
          }

          // Track decision for feedback loop
          trackControllerDecision({
            reconciliationId: reconciliation.id,
            bankTransactionId: reconciliation.bankTransactionId ?? undefined,
            invoiceId: reconciliation.invoiceId ?? undefined,
            userId: user.id,
            companyId: company.id,
            controllerAction: "approve",
          }).catch(() => {});

          createAuditLog({
            userId: user.id,
            action: "RECONCILIATION_APPROVED",
            entityType: "Reconciliation",
            entityId: reconciliation.id,
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "approve",
            reconciliationId: reconciliation.id,
          });
        }

        case "reject": {
          const reconciliation = await prisma.reconciliation.findFirst({
            where: { id: input.reconciliationId, companyId: company.id },
          });

          if (!reconciliation) {
            return NextResponse.json(
              { error: "Reconciliation not found." },
              { status: 404 }
            );
          }

          await prisma.reconciliation.update({
            where: { id: reconciliation.id },
            data: {
              status: "REJECTED",
              resolvedAt: new Date(),
              resolvedById: user.id,
              resolution: input.reason,
            },
          });

          // Reset bank transaction status so it can be re-matched
          if (reconciliation.bankTransactionId) {
            await prisma.bankTransaction.update({
              where: { id: reconciliation.bankTransactionId },
              data: { status: "PENDING" },
            });
          }

          // NEGATIVE FEEDBACK: if the match was created by a rule, deactivate it
          // matchReason format: "rule:{ruleId}:{ruleName}"
          if (reconciliation.matchReason?.startsWith("rule:")) {
            const ruleId = reconciliation.matchReason.split(":")[1];
            if (ruleId) {
              await prisma.matchingRule.update({
                where: { id: ruleId },
                data: { isActive: false },
              }).catch(() => {}); // Non-critical
            }
          }

          // Track rejection for feedback loop (corrections are the most valuable signal)
          trackControllerDecision({
            reconciliationId: reconciliation.id,
            bankTransactionId: reconciliation.bankTransactionId ?? undefined,
            invoiceId: reconciliation.invoiceId ?? undefined,
            userId: user.id,
            companyId: company.id,
            controllerAction: "reject",
            correctedField: "action",
            correctedFrom: reconciliation.matchReason?.split(":")[0] ?? "unknown",
            correctedTo: "rejected:" + input.reason,
          }).catch(() => {});

          createAuditLog({
            userId: user.id,
            action: "RECONCILIATION_REJECTED",
            entityType: "Reconciliation",
            entityId: reconciliation.id,
            details: { reason: input.reason },
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "reject",
            reconciliationId: reconciliation.id,
          });
        }

        case "manual_match": {
          // Verify both entities belong to this company
          const [bankTx, invoice] = await Promise.all([
            prisma.bankTransaction.findFirst({
              where: { id: input.bankTransactionId, companyId: company.id },
            }),
            prisma.invoice.findFirst({
              where: { id: input.invoiceId, companyId: company.id },
            }),
          ]);

          if (!bankTx) {
            return NextResponse.json(
              { error: "Bank transaction not found." },
              { status: 404 }
            );
          }
          if (!invoice) {
            return NextResponse.json(
              { error: "Invoice not found." },
              { status: 404 }
            );
          }

          const diff = Math.abs(
            Math.abs(bankTx.amount) - invoice.totalAmount
          );

          const reconciliation = await prisma.reconciliation.create({
            data: {
              companyId: company.id,
              type: "MANUAL",
              confidenceScore: 1.0,
              matchReason: `Manual match by ${user.email}`,
              status: "APPROVED",
              invoiceAmount: invoice.totalAmount,
              bankAmount: Math.abs(bankTx.amount),
              difference: diff > 0.01 ? diff : 0,
              differenceReason: input.differenceReason ?? null,
              differenceAccountId: input.differenceAccountId ?? null,
              bankTransactionId: bankTx.id,
              invoiceId: invoice.id,
              resolvedAt: new Date(),
              resolvedById: user.id,
            },
          });

          await prisma.bankTransaction.update({
            where: { id: bankTx.id },
            data: { status: "RECONCILED", detectedType: "MATCH_SIMPLE" },
          });

          const newPaid = invoice.amountPaid + Math.abs(bankTx.amount);
          const isPaid = newPaid >= invoice.totalAmount - 0.01;
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid: newPaid,
              amountPending: Math.max(0, invoice.totalAmount - newPaid),
              status: isPaid ? "PAID" : "PARTIAL",
            },
          });

          createAuditLog({
            userId: user.id,
            action: "MANUAL_MATCH",
            entityType: "Reconciliation",
            entityId: reconciliation.id,
            details: {
              bankTransactionId: bankTx.id,
              invoiceId: invoice.id,
            },
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "manual_match",
            reconciliationId: reconciliation.id,
          });
        }

        case "classify": {
          const bankTx = await prisma.bankTransaction.findFirst({
            where: { id: input.bankTransactionId, companyId: company.id },
          });

          if (!bankTx) {
            return NextResponse.json(
              { error: "Bank transaction not found." },
              { status: 404 }
            );
          }

          const account = await prisma.account.findFirst({
            where: { code: input.accountCode, companyId: company.id },
          });

          if (!account) {
            return NextResponse.json(
              { error: `Account ${input.accountCode} not found.` },
              { status: 404 }
            );
          }

          const classification =
            await prisma.bankTransactionClassification.create({
              data: {
                accountId: account.id,
                cashflowType: input.cashflowType,
                description: input.description ?? null,
              },
            });

          await prisma.bankTransaction.update({
            where: { id: bankTx.id },
            data: {
              status: "CLASSIFIED",
              classificationId: classification.id,
              detectedType: "EXPENSE_NO_INVOICE",
            },
          });

          // Track classification decision
          trackControllerDecision({
            reconciliationId: reconciliationId,
            bankTransactionId: input.bankTransactionId,
            userId: user.id,
            companyId: company.id,
            controllerAction: `classify:${input.accountCode}`,
            correctedField: "accountCode",
            correctedTo: input.accountCode,
            createdExplicitRule: false,
          }).catch(() => {});

          createAuditLog({
            userId: user.id,
            action: "TRANSACTION_CLASSIFIED",
            entityType: "BankTransaction",
            entityId: bankTx.id,
            details: {
              accountCode: input.accountCode,
              cashflowType: input.cashflowType,
            },
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "classify",
            bankTransactionId: bankTx.id,
            classificationId: classification.id,
          });
        }

        case "mark_internal": {
          const bankTx = await prisma.bankTransaction.findFirst({
            where: { id: input.bankTransactionId, companyId: company.id },
          });

          if (!bankTx) {
            return NextResponse.json(
              { error: "Bank transaction not found." },
              { status: 404 }
            );
          }

          await prisma.bankTransaction.update({
            where: { id: bankTx.id },
            data: {
              status: "INTERNAL",
              detectedType: "INTERNAL_TRANSFER",
              priority: "ROUTINE",
            },
          });

          createAuditLog({
            userId: user.id,
            action: "MARKED_INTERNAL",
            entityType: "BankTransaction",
            entityId: bankTx.id,
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "mark_internal",
            bankTransactionId: bankTx.id,
          });
        }

        case "ignore": {
          const bankTx = await prisma.bankTransaction.findFirst({
            where: { id: input.bankTransactionId, companyId: company.id },
          });

          if (!bankTx) {
            return NextResponse.json(
              { error: "Bank transaction not found." },
              { status: 404 }
            );
          }

          await prisma.bankTransaction.update({
            where: { id: bankTx.id },
            data: {
              status: "IGNORED",
              note: input.reason,
              noteAuthorId: user.id,
              noteCreatedAt: new Date(),
            },
          });

          createAuditLog({
            userId: user.id,
            action: "TRANSACTION_IGNORED",
            entityType: "BankTransaction",
            entityId: bankTx.id,
            details: { reason: input.reason },
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "ignore",
            bankTransactionId: bankTx.id,
          });
        }

        case "mark_duplicate": {
          const bankTx = await prisma.bankTransaction.findFirst({
            where: { id: input.bankTransactionId, companyId: company.id },
          });

          if (!bankTx) {
            return NextResponse.json(
              { error: "Bank transaction not found." },
              { status: 404 }
            );
          }

          await prisma.bankTransaction.update({
            where: { id: bankTx.id },
            data: {
              status: "DUPLICATE",
              detectedType: "POSSIBLE_DUPLICATE",
            },
          });

          createAuditLog({
            userId: user.id,
            action: "MARKED_DUPLICATE",
            entityType: "BankTransaction",
            entityId: bankTx.id,
            details: { duplicateOfId: input.duplicateOfId },
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "mark_duplicate",
            bankTransactionId: bankTx.id,
          });
        }

        case "mark_legitimate": {
          const group = await prisma.duplicateGroup.findUnique({
            where: { id: input.duplicateGroupId },
            include: { transactions: { select: { id: true, companyId: true } } },
          });

          if (
            !group ||
            !group.transactions.every((t) => t.companyId === company.id)
          ) {
            return NextResponse.json(
              { error: "Duplicate group not found." },
              { status: 404 }
            );
          }

          await prisma.duplicateGroup.update({
            where: { id: group.id },
            data: {
              status: "LEGITIMATE",
              resolvedAt: new Date(),
              resolution: `Marked legitimate by ${user.email}`,
            },
          });

          // Reset all transactions in the group back to PENDING
          await prisma.bankTransaction.updateMany({
            where: {
              duplicateGroupId: group.id,
              companyId: company.id,
            },
            data: {
              status: "PENDING",
              detectedType: null,
            },
          });

          createAuditLog({
            userId: user.id,
            action: "DUPLICATE_GROUP_LEGITIMATE",
            entityType: "DuplicateGroup",
            entityId: group.id,
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            action: "mark_legitimate",
            duplicateGroupId: group.id,
          });
        }

        default:
          return NextResponse.json(
            { error: "Unknown action." },
            { status: 400 }
          );
      }
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
