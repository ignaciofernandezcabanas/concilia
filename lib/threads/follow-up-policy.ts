/**
 * Default follow-up policies per scenario.
 *
 * Each policy defines: intervalDays, maxAttempts, toneProgression,
 * autoResolveCondition type, and default priority.
 */

export interface FollowUpPolicy {
  intervalDays: number;
  maxAttempts: number;
  toneProgression: string[];
  autoResolveType: string;
  defaultPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export const SCENARIO_POLICIES: Record<string, FollowUpPolicy> = {
  OVERDUE_RECEIVABLE: {
    intervalDays: 4,
    maxAttempts: 3,
    toneProgression: ["friendly", "firm", "formal"],
    autoResolveType: "invoice_paid",
    defaultPriority: "MEDIUM",
  },
  DUPLICATE_OR_OVERPAYMENT: {
    intervalDays: 3,
    maxAttempts: 2,
    toneProgression: ["friendly", "firm"],
    autoResolveType: "transaction_matched",
    defaultPriority: "HIGH",
  },
  SUPPLIER_DISCREPANCY: {
    intervalDays: 5,
    maxAttempts: 3,
    toneProgression: ["friendly", "firm", "formal"],
    autoResolveType: "document_received",
    defaultPriority: "MEDIUM",
  },
  MISSING_FISCAL_DOCS: {
    intervalDays: 3,
    maxAttempts: 4,
    toneProgression: ["friendly", "friendly", "firm", "formal"],
    autoResolveType: "document_received",
    defaultPriority: "HIGH",
  },
  GESTORIA_RECONCILIATION: {
    intervalDays: 5,
    maxAttempts: 2,
    toneProgression: ["friendly", "firm"],
    autoResolveType: "balance_zero",
    defaultPriority: "MEDIUM",
  },
  BANK_RETURN: {
    intervalDays: 3,
    maxAttempts: 3,
    toneProgression: ["firm", "formal", "formal"],
    autoResolveType: "invoice_paid",
    defaultPriority: "HIGH",
  },
  UNIDENTIFIED_ADVANCE: {
    intervalDays: 5,
    maxAttempts: 2,
    toneProgression: ["friendly", "firm"],
    autoResolveType: "transaction_matched",
    defaultPriority: "MEDIUM",
  },
  INTERCOMPANY: {
    intervalDays: 7,
    maxAttempts: 2,
    toneProgression: ["friendly", "firm"],
    autoResolveType: "balance_zero",
    defaultPriority: "LOW",
  },
};

/**
 * Get policy for a scenario, merging with company config overrides if available.
 */
export function getPolicy(
  scenario: string,
  companyConfig?: {
    scenarioDefaults?: Record<string, Partial<FollowUpPolicy>>;
    defaultIntervalDays?: number;
    defaultMaxAttempts?: number;
    defaultToneProgression?: string[];
  }
): FollowUpPolicy {
  const base = SCENARIO_POLICIES[scenario] ?? SCENARIO_POLICIES.OVERDUE_RECEIVABLE;
  const override = companyConfig?.scenarioDefaults?.[scenario];

  return {
    intervalDays: override?.intervalDays ?? companyConfig?.defaultIntervalDays ?? base.intervalDays,
    maxAttempts: override?.maxAttempts ?? companyConfig?.defaultMaxAttempts ?? base.maxAttempts,
    toneProgression:
      override?.toneProgression ?? companyConfig?.defaultToneProgression ?? base.toneProgression,
    autoResolveType: override?.autoResolveType ?? base.autoResolveType,
    defaultPriority: override?.defaultPriority ?? base.defaultPriority,
  };
}

/**
 * Get the current tone based on follow-up count and policy.
 */
export function getCurrentTone(policy: FollowUpPolicy, followUpCount: number): string {
  const idx = Math.min(followUpCount, policy.toneProgression.length - 1);
  return policy.toneProgression[idx] ?? "firm";
}
