/**
 * Central AI model router.
 *
 * All LLM calls go through callAI() or callAIJson().
 * Routes tasks to the appropriate model (Haiku/Sonnet/Opus).
 * Wraps with rate limiting, circuit breaker, and observability.
 */

import { anthropic } from "@/lib/ai/client";
import { withRateLimit } from "@/lib/ai/rate-limiter";
import { z } from "zod";

// ── Task → Model routing ──

export type AITask =
  // Haiku — NLP simple
  | "parse_concept"
  | "extract_invoice_pdf"
  | "explain_bandeja"
  | "validate_email_draft"
  | "classify_quick"
  // Sonnet — razonamiento financiero
  | "match_llm"
  | "classify_llm"
  | "parse_rule_nl"
  | "draft_reminder"
  | "detect_periodification"
  | "explain_anomaly"
  | "treasury_advice"
  | "draft_inquiry"
  | "analyze_inquiry_response"
  | "ic_elimination_explain"
  | "explain_group_anomaly"
  | "variance_consolidated"
  // Opus — síntesis compleja
  | "daily_briefing"
  | "weekly_briefing"
  | "close_proposal"
  | "risk_analysis"
  | "consolidation_review";

interface TaskConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

const TASK_CONFIG: Record<AITask, TaskConfig> = {
  // Haiku
  parse_concept:        { model: "claude-haiku-4-5-20251001", maxTokens: 200, temperature: 0.0 },
  extract_invoice_pdf:  { model: "claude-haiku-4-5-20251001", maxTokens: 300, temperature: 0.0 },
  explain_bandeja:      { model: "claude-haiku-4-5-20251001", maxTokens: 300, temperature: 0.2 },
  validate_email_draft: { model: "claude-haiku-4-5-20251001", maxTokens: 150, temperature: 0.0 },
  classify_quick:       { model: "claude-haiku-4-5-20251001", maxTokens: 200, temperature: 0.0 },
  // Sonnet
  match_llm:            { model: "claude-sonnet-4-20250514", maxTokens: 1200, temperature: 0.1 },
  classify_llm:         { model: "claude-sonnet-4-20250514", maxTokens: 1200, temperature: 0.1 },
  parse_rule_nl:        { model: "claude-sonnet-4-20250514", maxTokens: 1000, temperature: 0.1 },
  draft_reminder:       { model: "claude-sonnet-4-20250514", maxTokens: 800, temperature: 0.3 },
  detect_periodification: { model: "claude-sonnet-4-20250514", maxTokens: 500, temperature: 0.1 },
  explain_anomaly:      { model: "claude-sonnet-4-20250514", maxTokens: 500, temperature: 0.2 },
  treasury_advice:      { model: "claude-sonnet-4-20250514", maxTokens: 600, temperature: 0.2 },
  draft_inquiry:        { model: "claude-sonnet-4-20250514", maxTokens: 1000, temperature: 0.3 },
  analyze_inquiry_response: { model: "claude-haiku-4-5-20251001", maxTokens: 300, temperature: 0.0 },
  ic_elimination_explain: { model: "claude-sonnet-4-20250514", maxTokens: 500, temperature: 0.2 },
  explain_group_anomaly:  { model: "claude-sonnet-4-20250514", maxTokens: 500, temperature: 0.2 },
  variance_consolidated:  { model: "claude-sonnet-4-20250514", maxTokens: 600, temperature: 0.2 },
  // Opus
  daily_briefing:       { model: "claude-opus-4-6", maxTokens: 1500, temperature: 0.3 },
  weekly_briefing:      { model: "claude-opus-4-6", maxTokens: 2000, temperature: 0.3 },
  close_proposal:       { model: "claude-opus-4-6", maxTokens: 1200, temperature: 0.2 },
  risk_analysis:        { model: "claude-opus-4-6", maxTokens: 800, temperature: 0.2 },
  consolidation_review: { model: "claude-opus-4-6", maxTokens: 1200, temperature: 0.2 },
};

// ── In-memory call log ──

export interface AICallRecord {
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  timestamp: Date;
}

const callBuffer: AICallRecord[] = [];
const MAX_BUFFER_SIZE = 500;

export function getCallBuffer(): readonly AICallRecord[] {
  return callBuffer;
}

export function clearCallBuffer(): void {
  callBuffer.length = 0;
}

function recordCall(record: AICallRecord): void {
  if (callBuffer.length >= MAX_BUFFER_SIZE) {
    callBuffer.shift();
  }
  callBuffer.push(record);

  if (process.env.NODE_ENV !== "production") {
    const status = record.success ? "✅" : "❌";
    console.log(
      `[ai] ${record.task} | ${record.model.split("-").slice(-2, -1)[0] ?? record.model} | ` +
      `${record.inputTokens}→${record.outputTokens} tok | ${record.latencyMs}ms | ${status}`
    );
  }
}

// ── Core functions ──

/**
 * Call the appropriate LLM for a task. Returns the text response or null.
 */
export async function callAI(
  task: AITask,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const config = TASK_CONFIG[task];
  const start = Date.now();

  const response = await withRateLimit(() =>
    anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  const latencyMs = Date.now() - start;

  if (!response) {
    recordCall({
      task, model: config.model,
      inputTokens: 0, outputTokens: 0,
      latencyMs, success: false, timestamp: new Date(),
    });
    return null;
  }

  recordCall({
    task, model: config.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    latencyMs, success: true, timestamp: new Date(),
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return text.trim() || null;
}

/**
 * Call the LLM and parse the response as JSON validated by a Zod schema.
 * Returns null if the response is not valid JSON or fails schema validation.
 */
export async function callAIJson<T>(
  task: AITask,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  const text = await callAI(task, systemPrompt, userPrompt);
  if (!text) return null;

  try {
    // Strip markdown code blocks and <json> tags
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .replace(/<json>\s*/g, "")
      .replace(/<\/json>\s*/g, "")
      .trim();

    // Find the JSON object/array
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[ai] ${task} schema validation failed:`, result.error.issues.slice(0, 3));
      }
      return null;
    }

    return result.data;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[ai] ${task} JSON parse failed:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

/**
 * Call LLM with document content (for PDF extraction).
 * Uses the messages API with document content blocks.
 */
export async function callAIWithDocument(
  task: AITask,
  systemPrompt: string,
  textPrompt: string,
  documentBase64: string,
  mediaType: string = "application/pdf"
): Promise<string | null> {
  const config = TASK_CONFIG[task];
  const start = Date.now();

  const response = await withRateLimit(() =>
    anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document" as const,
              source: { type: "base64" as const, media_type: mediaType, data: documentBase64 },
            } as never,
            { type: "text" as const, text: textPrompt },
          ],
        },
      ],
    })
  );

  const latencyMs = Date.now() - start;

  if (!response) {
    recordCall({
      task, model: config.model,
      inputTokens: 0, outputTokens: 0,
      latencyMs, success: false, timestamp: new Date(),
    });
    return null;
  }

  recordCall({
    task, model: config.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    latencyMs, success: true, timestamp: new Date(),
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return text.trim() || null;
}
