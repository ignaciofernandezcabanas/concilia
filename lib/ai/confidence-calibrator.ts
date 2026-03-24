/**
 * Confidence Calibrator — DB-persisted.
 *
 * Adjusts confidence for patterns based on controller feedback.
 * All state persisted in ConfidenceAdjustment table.
 */

import { prisma } from "@/lib/db";
import type { ActionCategory } from "./confidence-engine";

interface CalibrationDecision {
  wasAutoExecuted: boolean;
  wasModified: boolean;
  category: ActionCategory;
  patternKey: string;
  companyId: string;
}

/**
 * Adjust confidence based on controller decision.
 */
export async function calibrateFromDecision(decision: CalibrationDecision): Promise<void> {
  const { category, patternKey, companyId } = decision;

  if (!patternKey) return;

  const existing = await prisma.confidenceAdjustment.findUnique({
    where: { category_patternKey_companyId: { category, patternKey, companyId } },
  });

  if (decision.wasAutoExecuted && decision.wasModified) {
    // Auto-executed but controller corrected → BAD
    const newErrors = (existing?.errors30d ?? 0) + 1;
    const newAdj = (existing?.adjustment ?? 0) - 0.1;

    await prisma.confidenceAdjustment.upsert({
      where: { category_patternKey_companyId: { category, patternKey, companyId } },
      create: {
        category,
        patternKey,
        companyId,
        adjustment: -0.1,
        errors30d: 1,
        lastErrorAt: new Date(),
        pausedUntil: null,
      },
      update: {
        adjustment: newAdj,
        errors30d: newErrors,
        lastErrorAt: new Date(),
        // 2 errors in 30 days → pause 24h
        ...(newErrors >= 2 ? { pausedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) } : {}),
      },
    });

    if (newErrors >= 2) {
      console.warn(
        `[calibrator] Category ${category} paused for company ${companyId} ` +
          `due to ${newErrors} auto-execute errors.`
      );
    }
    return;
  }

  if (!decision.wasAutoExecuted && !decision.wasModified) {
    // In bandeja + approved without changes → GOOD
    const newAdj = (existing?.adjustment ?? 0) + 0.01;

    await prisma.confidenceAdjustment.upsert({
      where: { category_patternKey_companyId: { category, patternKey, companyId } },
      create: {
        category,
        patternKey,
        companyId,
        adjustment: 0.01,
      },
      update: {
        adjustment: newAdj,
      },
    });
    return;
  }
}

/**
 * Get the persisted adjustment for a pattern.
 */
export async function getPatternAdjustment(
  companyId: string,
  category: ActionCategory,
  patternKey: string
): Promise<number> {
  if (!patternKey) return 0;

  const record = await prisma.confidenceAdjustment.findUnique({
    where: { category_patternKey_companyId: { category, patternKey, companyId } },
    select: { adjustment: true },
  });

  return record?.adjustment ?? 0;
}

/**
 * Check if a category is paused for a company.
 */
export async function isCategoryPaused(
  companyId: string,
  category: ActionCategory
): Promise<boolean> {
  const paused = await prisma.confidenceAdjustment.findFirst({
    where: {
      companyId,
      category,
      pausedUntil: { gt: new Date() },
    },
    select: { id: true },
  });

  return !!paused;
}

/**
 * Reset errors for a pattern.
 */
export async function resetPatternErrors(
  companyId: string,
  category: ActionCategory,
  patternKey?: string
): Promise<void> {
  if (patternKey) {
    await prisma.confidenceAdjustment.deleteMany({
      where: { category, patternKey, companyId },
    });
  } else {
    await prisma.confidenceAdjustment.updateMany({
      where: { category, companyId },
      data: { pausedUntil: null, errors30d: 0 },
    });
  }
}
