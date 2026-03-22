/**
 * Tracks controller decisions for the feedback loop.
 *
 * Every time a controller resolves an item in the bandeja, this module:
 * 1. Captures what the system proposed vs what the controller decided
 * 2. Determines if the proposal was modified
 * 3. Stores full context for pattern learning
 * 4. Updates implicit learned patterns
 * 5. Only stores DEFINITIVE decisions (ignores provisional/later-corrected ones)
 */

import { prisma } from "@/lib/db";

interface DecisionContext {
  reconciliationId: string;
  bankTransactionId?: string;
  invoiceId?: string;
  userId: string;
  companyId: string;
  controllerAction: string;
  // If controller changed the difference reason or account, capture the correction
  correctedField?: string;   // "differenceReason", "accountCode", etc.
  correctedFrom?: string;    // original system value
  correctedTo?: string;      // controller value
  createdExplicitRule?: boolean;
}

export async function trackControllerDecision(ctx: DecisionContext): Promise<void> {
  try {
    // Load context — either from reconciliation or directly from bank transaction
    let reco: Awaited<ReturnType<typeof prisma.reconciliation.findUnique>> & {
      bankTransaction?: { amount: number; counterpartIban: string | null; counterpartName: string | null; concept: string | null; valueDate: Date; reconciliations?: unknown[] } | null;
      invoice?: { contact?: { name: string; cif: string | null } | null } | null;
    } | null = null;

    if (ctx.reconciliationId) {
      reco = await prisma.reconciliation.findUnique({
        where: { id: ctx.reconciliationId },
        include: {
          bankTransaction: {
            include: {
              reconciliations: { where: { status: { not: "REJECTED" } }, take: 1 },
            },
          },
          invoice: { include: { contact: true } },
        },
      });
    }

    // If no reco but we have a bankTransactionId, load tx directly
    if (!reco && ctx.bankTransactionId) {
      const tx = await prisma.bankTransaction.findUnique({ where: { id: ctx.bankTransactionId } });
      if (tx) {
        // Create a minimal reco-like object for context extraction
        reco = {
          id: "", matchReason: null, confidenceScore: 0, difference: null, differenceReason: null,
          bankTransactionId: tx.id, invoiceId: null, companyId: ctx.companyId,
          type: "MANUAL", status: "PROPOSED", invoiceAmount: null, bankAmount: null,
          differenceAccountId: null, resolvedAt: null, resolvedById: null, resolution: null,
          createdAt: new Date(), updatedAt: new Date(),
          bankTransaction: tx, invoice: null,
        } as unknown as typeof reco;
      }
    }

    if (!reco) return;

    const tx = reco.bankTransaction;
    const invoice = reco.invoice;
    const contact = invoice?.contact;

    // Determine system proposal
    const systemProposal = reco.matchReason?.split(":")[0] ?? "unknown";
    const systemConfidence = reco.confidenceScore ?? 0;

    // Was the proposal modified?
    const wasModified = !!ctx.correctedField || ctx.controllerAction === "reject";

    // Determine amount range bucket
    const absAmount = Math.abs(tx?.amount ?? 0);
    const amountRange = absAmount < 100 ? "0-100"
      : absAmount < 500 ? "100-500"
      : absAmount < 5000 ? "500-5000"
      : "5000+";

    // Determine transaction type
    const txType = !tx ? null
      : tx.amount > 0 ? "cobro"
      : "pago";

    // Check if this is a recurring pattern (same IBAN in last 3 months)
    let isRecurring = false;
    if (tx?.counterpartIban) {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const count = await prisma.bankTransaction.count({
        where: {
          companyId: ctx.companyId,
          counterpartIban: tx.counterpartIban,
          valueDate: { gte: threeMonthsAgo },
        },
      });
      isRecurring = count >= 3;
    }

    // Mark any previous provisional decision for this tx as non-definitive
    if (ctx.bankTransactionId) {
      await prisma.controllerDecision.updateMany({
        where: {
          bankTransactionId: ctx.bankTransactionId,
          companyId: ctx.companyId,
          isDefinitive: true,
        },
        data: { isDefinitive: false },
      });
    }

    // Store the decision
    await prisma.controllerDecision.create({
      data: {
        systemProposal,
        systemConfidence,
        systemMatchReason: reco.matchReason,
        controllerAction: ctx.controllerAction,
        wasModified,
        isDefinitive: true,
        counterpartName: contact?.name ?? tx?.counterpartName,
        counterpartCif: contact?.cif,
        counterpartIban: tx?.counterpartIban,
        transactionType: txType,
        amountRange,
        bankConcept: tx?.concept,
        dayOfMonth: tx?.valueDate ? tx.valueDate.getDate() : null,
        isRecurring,
        differenceAmount: reco.difference,
        differenceReason: ctx.correctedTo ?? reco.differenceReason ?? null,
        createdExplicitRule: ctx.createdExplicitRule ?? false,
        reconciliationId: ctx.reconciliationId,
        bankTransactionId: ctx.bankTransactionId ?? reco.bankTransactionId,
        invoiceId: ctx.invoiceId ?? reco.invoiceId,
        userId: ctx.userId,
        companyId: ctx.companyId,
      },
    });

    // Update implicit learned patterns
    if (wasModified && ctx.correctedField && ctx.correctedTo) {
      await updateLearnedPattern(ctx);
    }
  } catch (err) {
    // Non-critical — don't break the resolve flow
    console.error("[decision-tracker] Error:", err instanceof Error ? err.message : err);
  }
}

/**
 * Update or create an implicit learned pattern from a controller correction.
 */
async function updateLearnedPattern(ctx: DecisionContext): Promise<void> {
  const reco = await prisma.reconciliation.findUnique({
    where: { id: ctx.reconciliationId },
    include: { bankTransaction: true },
  });
  if (!reco?.bankTransaction) return;

  const tx = reco.bankTransaction;
  const patternKey = `${ctx.correctedField}:${tx.counterpartIban ?? "noiban"}`;

  const existing = await prisma.learnedPattern.findFirst({
    where: {
      companyId: ctx.companyId,
      counterpartIban: tx.counterpartIban,
      type: ctx.correctedField ?? "correction",
      isActive: true,
    },
  });

  if (existing) {
    // Check if the prediction matches
    const isCorrect = existing.predictedAction === ctx.correctedTo;
    await prisma.learnedPattern.update({
      where: { id: existing.id },
      data: {
        occurrences: { increment: 1 },
        correctPredictions: isCorrect ? { increment: 1 } : undefined,
        confidence: {
          set: (existing.correctPredictions + (isCorrect ? 1 : 0)) / (existing.occurrences + 1),
        },
        // If the prediction was wrong, update it to the controller's choice
        ...(!isCorrect ? { predictedAction: ctx.correctedTo!, predictedReason: ctx.correctedTo } : {}),
      },
    });
  } else {
    // Create new pattern
    await prisma.learnedPattern.create({
      data: {
        type: ctx.correctedField ?? "correction",
        counterpartIban: tx.counterpartIban,
        counterpartName: tx.counterpartName,
        conceptPattern: tx.concept?.slice(0, 100),
        predictedAction: ctx.correctedTo!,
        predictedReason: ctx.correctedTo,
        occurrences: 1,
        correctPredictions: 1,
        confidence: 1.0,
        companyId: ctx.companyId,
      },
    });
  }
}
