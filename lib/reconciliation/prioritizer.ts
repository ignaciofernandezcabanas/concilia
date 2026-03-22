import type { DetectedType, TransactionPriority } from "@prisma/client";

/**
 * Assigns a review priority to a reconciliation item based on its detected type,
 * confidence score, and the company's materiality threshold.
 *
 * Priority levels:
 * - URGENT: duplicates, returns, errors -- need immediate attention
 * - DECISION: unidentified items above materiality, low confidence
 * - CONFIRMATION: moderate confidence, partial matches, differences
 * - ROUTINE: high confidence, auto-approvable
 */
export function assignPriority(
  tx: { amount: number },
  detectedType: DetectedType | null,
  confidence: number,
  materialityThreshold: number
): TransactionPriority {
  const absAmount = Math.abs(tx.amount);

  // URGENT: items that require immediate attention
  if (
    detectedType === "POSSIBLE_DUPLICATE" ||
    detectedType === "RETURN"
  ) {
    return "URGENT";
  }

  // DECISION: unidentified items above materiality or very low confidence
  if (detectedType === "UNIDENTIFIED" && absAmount > materialityThreshold) {
    return "DECISION";
  }

  if (confidence < 0.70) {
    return "DECISION";
  }

  // CONFIRMATION: moderate confidence, partial matches, or differences
  if (confidence < 0.90) {
    return "CONFIRMATION";
  }

  if (
    detectedType === "MATCH_PARTIAL" ||
    detectedType === "MATCH_DIFFERENCE"
  ) {
    return "CONFIRMATION";
  }

  // ROUTINE: high confidence, straightforward items
  return "ROUTINE";
}
