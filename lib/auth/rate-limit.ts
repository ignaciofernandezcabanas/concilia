/**
 * HTTP rate limiting per IP.
 *
 * In-memory store (single instance). For multi-instance, replace with Upstash Redis.
 *
 * Tiers:
 *   read:    100 req/min per IP (GET)
 *   write:    30 req/min per IP (POST/PUT/DELETE)
 *   auth:      5 req/min per IP (login/register)
 *   engine:    3 req/min per key (reconciliation run)
 */

export type RateLimitTier = "read" | "write" | "auth" | "engine";

const TIER_LIMITS: Record<RateLimitTier, { maxRequests: number; windowMs: number }> = {
  read:   { maxRequests: 100, windowMs: 60_000 },
  write:  { maxRequests: 30,  windowMs: 60_000 },
  auth:   { maxRequests: 5,   windowMs: 60_000 },
  engine: { maxRequests: 3,   windowMs: 60_000 },
};

interface BucketEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, BucketEntry>();

// Cleanup stale entries every 5 minutes
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of Array.from(store)) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export function checkRateLimit(key: string, tier: RateLimitTier): RateLimitResult {
  cleanup();

  const { maxRequests, windowMs } = TIER_LIMITS[tier];
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count < maxRequests) {
    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count };
  }

  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return { allowed: false, remaining: 0, retryAfter };
}

/** Reset rate limit for a key (useful for testing). */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Reset all rate limits (useful for testing). */
export function resetAllRateLimits(): void {
  store.clear();
}
