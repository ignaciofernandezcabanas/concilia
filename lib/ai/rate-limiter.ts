/**
 * Rate limiter + circuit breaker for Anthropic API calls.
 *
 * - Max 5 concurrent requests
 * - Queue: waits if at limit
 * - Circuit breaker: 3 consecutive errors → pause 60s → classify as UNIDENTIFIED
 */

const MAX_CONCURRENT = 5;
const CIRCUIT_BREAK_THRESHOLD = 3;
const CIRCUIT_BREAK_DURATION_MS = 60_000;

let activeRequests = 0;
let consecutiveErrors = 0;
let circuitBrokenUntil: number | null = null;
const waitQueue: (() => void)[] = [];

function isCircuitBroken(): boolean {
  if (circuitBrokenUntil === null) return false;
  if (Date.now() >= circuitBrokenUntil) {
    circuitBrokenUntil = null;
    consecutiveErrors = 0;
    console.warn("[ai/rate-limiter] Circuit breaker reset — resuming LLM calls.");
    return false;
  }
  return true;
}

function releaseSlot(): void {
  activeRequests--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    next();
  }
}

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  // Wait for a slot
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

/**
 * Execute an Anthropic API call with rate limiting and circuit breaker.
 *
 * If the circuit is broken, returns null immediately (caller should
 * treat as UNIDENTIFIED / fallback).
 *
 * @param fn - The async function that makes the Anthropic API call
 * @returns The result, or null if circuit is broken or call failed
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>
): Promise<T | null> {
  // Check circuit breaker
  if (isCircuitBroken()) {
    console.warn("[ai/rate-limiter] Circuit broken — skipping LLM call.");
    return null;
  }

  await acquireSlot();

  try {
    const result = await fn();
    consecutiveErrors = 0; // Reset on success
    return result;
  } catch (err) {
    consecutiveErrors++;
    console.error(
      `[ai/rate-limiter] LLM error (${consecutiveErrors}/${CIRCUIT_BREAK_THRESHOLD}):`,
      err instanceof Error ? err.message : err
    );

    if (consecutiveErrors >= CIRCUIT_BREAK_THRESHOLD) {
      circuitBrokenUntil = Date.now() + CIRCUIT_BREAK_DURATION_MS;
      console.warn(
        `[ai/rate-limiter] Circuit breaker TRIPPED — pausing LLM calls for ${CIRCUIT_BREAK_DURATION_MS / 1000}s.`
      );
    }

    return null;
  } finally {
    releaseSlot();
  }
}
