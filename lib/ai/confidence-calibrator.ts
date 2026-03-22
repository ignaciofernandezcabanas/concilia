/**
 * Confidence Calibrator.
 *
 * Called when the controller takes an action to adjust
 * confidence patterns over time.
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

// In-memory pattern confidence adjustments
// Key: `${companyId}:${category}:${patternKey}`
const patternAdjustments = new Map<string, { adjustment: number; errors30d: number; lastError: Date | null }>();

// Categories paused due to repeated errors
const pausedCategories = new Map<string, Date>(); // `${companyId}:${category}` → paused until

/**
 * Adjust confidence based on controller decision.
 *
 * - Auto-executed + controller corrected → lower confidence -0.10, alert
 * - In bandeja + controller approved without changes → raise +0.01
 */
export async function calibrateFromDecision(decision: CalibrationDecision): Promise<void> {
  const key = `${decision.companyId}:${decision.category}:${decision.patternKey}`;
  const categoryKey = `${decision.companyId}:${decision.category}`;

  const current = patternAdjustments.get(key) ?? { adjustment: 0, errors30d: 0, lastError: null };

  if (decision.wasAutoExecuted && decision.wasModified) {
    // Auto-executed but controller corrected → BAD
    current.adjustment -= 0.10;
    current.errors30d++;
    current.lastError = new Date();

    // If 2 errors in 30 days → pause category
    if (current.errors30d >= 2) {
      const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // pause 24h
      pausedCategories.set(categoryKey, pauseUntil);
      console.warn(
        `[calibrator] Category ${decision.category} paused for company ${decision.companyId} ` +
        `due to ${current.errors30d} auto-execute errors in 30 days.`
      );
    }

    patternAdjustments.set(key, current);
    return;
  }

  if (!decision.wasAutoExecuted && !decision.wasModified) {
    // In bandeja + approved without changes → GOOD
    current.adjustment += 0.01;
    patternAdjustments.set(key, current);
    return;
  }

  // Other cases: no adjustment
}

/**
 * Get the current adjustment for a pattern.
 */
export function getPatternAdjustment(companyId: string, category: ActionCategory, patternKey: string): number {
  const key = `${companyId}:${category}:${patternKey}`;
  return patternAdjustments.get(key)?.adjustment ?? 0;
}

/**
 * Check if a category is paused for a company.
 */
export function isCategoryPaused(companyId: string, category: ActionCategory): boolean {
  const key = `${companyId}:${category}`;
  const pausedUntil = pausedCategories.get(key);
  if (!pausedUntil) return false;

  if (Date.now() >= pausedUntil.getTime()) {
    pausedCategories.delete(key);
    return false;
  }

  return true;
}

/**
 * Reset errors for a pattern (called when admin resumes a category).
 */
export function resetPatternErrors(companyId: string, category: ActionCategory, patternKey?: string): void {
  if (patternKey) {
    const key = `${companyId}:${category}:${patternKey}`;
    patternAdjustments.delete(key);
  }

  const categoryKey = `${companyId}:${category}`;
  pausedCategories.delete(categoryKey);
}
