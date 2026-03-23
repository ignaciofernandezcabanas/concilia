import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetAllRateLimits } from "@/lib/auth/rate-limit";

describe("HTTP Rate Limiting", () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 100; i++) {
      const result = checkRateLimit("ip1:read", "read");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    for (let i = 0; i < 100; i++) {
      checkRateLimit("ip2:read", "read");
    }
    const result = checkRateLimit("ip2:read", "read");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("write tier has lower limit than read", () => {
    for (let i = 0; i < 30; i++) {
      const result = checkRateLimit("ip3:write", "write");
      expect(result.allowed).toBe(true);
    }
    const result = checkRateLimit("ip3:write", "write");
    expect(result.allowed).toBe(false);
  });

  it("different IPs have separate limits", () => {
    // Exhaust IP1
    for (let i = 0; i < 100; i++) {
      checkRateLimit("ip4:read", "read");
    }
    expect(checkRateLimit("ip4:read", "read").allowed).toBe(false);

    // IP2 still allowed
    expect(checkRateLimit("ip5:read", "read").allowed).toBe(true);
  });

  it("auth tier blocks after 5 requests", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("ip6:auth", "auth").allowed).toBe(true);
    }
    expect(checkRateLimit("ip6:auth", "auth").allowed).toBe(false);
  });

  it("remaining count decreases", () => {
    const r1 = checkRateLimit("ip7:read", "read");
    expect(r1.remaining).toBe(99);
    const r2 = checkRateLimit("ip7:read", "read");
    expect(r2.remaining).toBe(98);
  });
});
