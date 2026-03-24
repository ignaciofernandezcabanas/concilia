// lib/ai/client.ts
// Anthropic SDK wrapper for Concilia
// All Claude API calls go through this module for logging and auditability

import Anthropic from "@anthropic-ai/sdk";
import {
  RECONCILIATION_SYSTEM_PROMPT,
  buildReconciliationUserMessage,
} from "./prompts/reconciliation";
import { CLASSIFIER_SYSTEM_PROMPT, ANOMALY_SYSTEM_PROMPT } from "./prompts/classifier";
import { prisma } from "../db"; // GLOBAL-PRISMA: audit logging for AI calls

// ============================================================
// SINGLETON — used by model-router.ts and other modules
// ============================================================

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  });

if (process.env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

// ============================================================
// TYPES
// ============================================================

interface ReconciliationResult {
  matchedInvoiceId: string | null;
  confidence: number;
  matchType: "EXACT" | "PARTIAL" | "GROUPED" | "NONE";
  reasoning: string;
  differenceAmount: number;
  differenceReason: string | null;
  suggestedAccountCode: string | null;
  alerts: string[];
}

interface ClassificationResult {
  accountCode: string;
  accountName: string;
  cashflowType: string;
  confidence: number;
  reasoning: string;
  needsInvoice: boolean;
  isRecurring: boolean;
  suggestedContactName: string | null;
  alerts: string[];
}

interface AnomalyResult {
  anomalies: Array<{
    severity: "LOW" | "MEDIUM" | "HIGH";
    type: string;
    description: string;
    transactionIds: string[];
    suggestedAction: string;
  }>;
}

// ============================================================
// CORE CALL WRAPPER (all calls go through here)
// ============================================================

async function callClaude<T>(params: {
  systemPrompt: string;
  userMessage: string;
  purpose: string;
  companyId: string;
  relatedIds?: string[];
}): Promise<T> {
  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userMessage }],
    });

    const textContent = response.content.find((b) => b.type === "text");
    const rawText = textContent?.text || "";

    // Strip markdown fences if present
    const cleanText = rawText.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleanText) as T;

    // Audit log — every LLM call is recorded
    // Use the first available user for audit (AI system calls)
    const auditUser = await prisma.user.findFirst({ select: { id: true } });
    if (auditUser) {
      await prisma.auditLog.create({
        data: {
          action: `AI_${params.purpose.toUpperCase()}`,
          entityType: "AI_CALL",
          entityId: params.relatedIds?.[0] || "batch",
          userId: auditUser.id,
          details: {
            model: MODEL,
            purpose: params.purpose,
            companyId: params.companyId,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            durationMs: Date.now() - startTime,
            relatedIds: params.relatedIds,
          },
        },
      });
    }

    return parsed;
  } catch (error) {
    const auditUserErr = await prisma.user.findFirst({ select: { id: true } });
    if (auditUserErr) {
      await prisma.auditLog.create({
        data: {
          action: `AI_${params.purpose.toUpperCase()}_ERROR`,
          entityType: "AI_CALL",
          entityId: params.relatedIds?.[0] || "batch",
          userId: auditUserErr.id,
          details: {
            model: MODEL,
            purpose: params.purpose,
            companyId: params.companyId,
            error: error instanceof Error ? error.message : "Unknown error",
            durationMs: Date.now() - startTime,
          },
        },
      });
    }

    throw error;
  }
}

// ============================================================
// PUBLIC API — These are the functions the rest of the app calls
// ============================================================

/**
 * Stage 5 of reconciliation pipeline: LLM matching
 * Called when deterministic matchers (exact, grouped, fuzzy) fail or have low confidence
 */
export async function matchTransactionWithLLM(params: {
  bankTransaction: Parameters<typeof buildReconciliationUserMessage>[0]["bankTransaction"];
  candidateInvoices: Parameters<typeof buildReconciliationUserMessage>[0]["candidateInvoices"];
  recentPatterns?: Parameters<typeof buildReconciliationUserMessage>[0]["recentPatterns"];
  companyId: string;
}): Promise<ReconciliationResult> {
  const userMessage = buildReconciliationUserMessage({
    bankTransaction: params.bankTransaction,
    candidateInvoices: params.candidateInvoices,
    recentPatterns: params.recentPatterns,
  });

  return callClaude<ReconciliationResult>({
    systemPrompt: RECONCILIATION_SYSTEM_PROMPT,
    userMessage,
    purpose: "reconciliation_match",
    companyId: params.companyId,
    relatedIds: [params.bankTransaction.id],
  });
}

/**
 * Stage 6 of reconciliation pipeline: LLM classification
 * Called for unmatched transactions that rule-based classifiers can't handle
 */
export async function classifyTransactionWithLLM(params: {
  bankTransaction: {
    id: string;
    amount: number;
    valueDate: string;
    concept: string;
    counterpartName?: string;
    counterpartIban?: string;
  };
  companyId: string;
}): Promise<ClassificationResult> {
  const { bankTransaction } = params;

  const userMessage = [
    `Importe: ${bankTransaction.amount}€ (${bankTransaction.amount > 0 ? "COBRO" : "PAGO"})`,
    `Fecha: ${bankTransaction.valueDate}`,
    `Concepto: ${bankTransaction.concept}`,
    bankTransaction.counterpartName
      ? `Ordenante/Beneficiario: ${bankTransaction.counterpartName}`
      : null,
    bankTransaction.counterpartIban ? `IBAN: ${bankTransaction.counterpartIban}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return callClaude<ClassificationResult>({
    systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
    userMessage,
    purpose: "transaction_classification",
    companyId: params.companyId,
    relatedIds: [bankTransaction.id],
  });
}

/**
 * Batch anomaly detection — run after sync, before controller triage
 */
export async function detectAnomalies(params: {
  transactions: Array<{
    id: string;
    amount: number;
    valueDate: string;
    concept: string;
    counterpartName?: string;
    status: string;
  }>;
  historicalPatterns: {
    recurringPayments: Array<{
      contactName: string;
      expectedDay: number;
      expectedAmount: number;
    }>;
    averageAmounts: Record<string, { mean: number; stdDev: number }>;
  };
  companyId: string;
}): Promise<AnomalyResult> {
  const userMessage = JSON.stringify({
    newTransactions: params.transactions,
    historicalPatterns: params.historicalPatterns,
  });

  return callClaude<AnomalyResult>({
    systemPrompt: ANOMALY_SYSTEM_PROMPT,
    userMessage,
    purpose: "anomaly_detection",
    companyId: params.companyId,
  });
}
