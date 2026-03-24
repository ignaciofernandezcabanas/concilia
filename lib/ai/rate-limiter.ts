/**
 * Rate limiter + circuit breaker for Anthropic API calls.
 *
 * v2: Uses DB-backed circuit breaker state for serverless compatibility.
 * In Vercel serverless, in-memory state resets per invocation.
 * The circuit breaker state (consecutive errors, broken-until timestamp)
 * is persisted in a Prisma model so it survives across invocations.
 *
 * Concurrency limiting is best-effort in serverless (no shared memory),
 * but the circuit breaker is the critical safety mechanism.
 *
 * - Circuit breaker: 3 consecutive errors → pause 60s
 * - Fail-open: if DB read fails, allow the call (don't block on storage failure)
 */

import { prisma } from "@/lib/db"; // GLOBAL-PRISMA: circuit breaker state shared across invocations

const CIRCUIT_BREAK_THRESHOLD = 3;
const CIRCUIT_BREAK_DURATION_MS = 60_000;

// In-memory fallback (works within a single invocation)
let memConsecutiveErrors = 0;
let memCircuitBrokenUntil: number | null = null;

// ── Circuit breaker state (DB-backed) ──

interface CircuitBreakerState {
  consecutiveErrors: number;
  brokenUntil: Date | null;
  lastErrorAt: Date | null;
}

async function getCircuitState(): Promise<CircuitBreakerState> {
  try {
    // Use a well-known key in the auditLog or a simple query
    // We'll use a lightweight approach: store in a JSON field of a known record
    const record = await prisma
      .$queryRawUnsafe<
        Array<{ consecutive_errors: number; broken_until: Date | null; last_error_at: Date | null }>
      >(`SELECT consecutive_errors, broken_until, last_error_at FROM _circuit_breaker WHERE id = 'ai_rate_limiter' LIMIT 1`)
      .catch(() => null);

    if (record && record.length > 0) {
      return {
        consecutiveErrors: record[0].consecutive_errors,
        brokenUntil: record[0].broken_until,
        lastErrorAt: record[0].last_error_at,
      };
    }
  } catch {
    // Table doesn't exist yet or DB error — use in-memory fallback
  }

  return {
    consecutiveErrors: memConsecutiveErrors,
    brokenUntil: memCircuitBrokenUntil ? new Date(memCircuitBrokenUntil) : null,
    lastErrorAt: null,
  };
}

async function updateCircuitState(errors: number, brokenUntil: Date | null): Promise<void> {
  // Update in-memory first (always works)
  memConsecutiveErrors = errors;
  memCircuitBrokenUntil = brokenUntil ? brokenUntil.getTime() : null;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO _circuit_breaker (id, consecutive_errors, broken_until, last_error_at, updated_at)
       VALUES ('ai_rate_limiter', $1, $2, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET consecutive_errors = $1, broken_until = $2, last_error_at = NOW(), updated_at = NOW()`,
      errors,
      brokenUntil
    );
  } catch {
    // DB write failed — in-memory state is still updated, will work for this invocation
  }
}

// ── Ensure table exists (run once, idempotent) ──

let tableChecked = false;
async function ensureTable(): Promise<void> {
  if (tableChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS _circuit_breaker (
        id TEXT PRIMARY KEY,
        consecutive_errors INT NOT NULL DEFAULT 0,
        broken_until TIMESTAMPTZ,
        last_error_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    tableChecked = true;
  } catch {
    tableChecked = true; // Don't retry on error
  }
}

// ── Public API (same interface as v1) ──

/**
 * Execute an Anthropic API call with circuit breaker protection.
 *
 * If the circuit is broken, returns null immediately.
 * On success, resets the error counter.
 * On failure, increments counter; trips breaker after 3 consecutive errors.
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T | null> {
  await ensureTable();

  const state = await getCircuitState();

  // Check circuit breaker
  if (state.brokenUntil) {
    if (new Date() < state.brokenUntil) {
      console.warn("[ai/rate-limiter] Circuit broken — skipping LLM call.");
      return null;
    }
    // Circuit expired — reset
    await updateCircuitState(0, null);
    console.warn("[ai/rate-limiter] Circuit breaker reset — resuming LLM calls.");
  }

  try {
    const result = await fn();
    // Reset on success
    if (state.consecutiveErrors > 0) {
      await updateCircuitState(0, null);
    }
    return result;
  } catch (err) {
    const newErrors = state.consecutiveErrors + 1;
    console.error(
      `[ai/rate-limiter] LLM error (${newErrors}/${CIRCUIT_BREAK_THRESHOLD}):`,
      err instanceof Error ? err.message : err
    );

    if (newErrors >= CIRCUIT_BREAK_THRESHOLD) {
      const brokenUntil = new Date(Date.now() + CIRCUIT_BREAK_DURATION_MS);
      await updateCircuitState(newErrors, brokenUntil);
      console.warn(
        `[ai/rate-limiter] Circuit breaker TRIPPED — pausing LLM calls for ${CIRCUIT_BREAK_DURATION_MS / 1000}s.`
      );
    } else {
      await updateCircuitState(newErrors, null);
    }

    return null;
  }
}

/**
 * Check if the circuit breaker is currently open (for external queries).
 */
export async function isCircuitBreakerOpen(): Promise<boolean> {
  const state = await getCircuitState();
  return state.brokenUntil !== null && new Date() < state.brokenUntil;
}
