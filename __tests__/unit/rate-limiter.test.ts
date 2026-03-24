import { describe, it, expect, beforeEach, vi } from "vitest";

describe("withRateLimit", () => {
  let withRateLimit: typeof import("@/lib/ai/rate-limiter").withRateLimit;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/ai/rate-limiter");
    withRateLimit = mod.withRateLimit;
  });

  it("ejecuta la función y devuelve el resultado", async () => {
    const result = await withRateLimit(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("devuelve null si la función falla", async () => {
    const result = await withRateLimit(() => Promise.reject(new Error("fail")));
    expect(result).toBeNull();
  });

  it("activa circuit breaker tras 3 errores consecutivos", async () => {
    const failingFn = () => Promise.reject(new Error("fail"));

    await withRateLimit(failingFn); // error 1
    await withRateLimit(failingFn); // error 2
    await withRateLimit(failingFn); // error 3 → circuit breaks

    // 4th call should return null WITHOUT executing fn
    const spy = vi.fn(() => Promise.resolve("should not run"));
    const result = await withRateLimit(spy);
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("resetea errores consecutivos tras un éxito", async () => {
    const failingFn = () => Promise.reject(new Error("fail"));
    const succeedingFn = () => Promise.resolve("ok");

    await withRateLimit(failingFn); // error 1
    await withRateLimit(failingFn); // error 2
    await withRateLimit(succeedingFn); // success → reset
    await withRateLimit(failingFn); // error 1 again
    await withRateLimit(failingFn); // error 2 again

    // Should NOT have tripped circuit (only 2 consecutive, not 3)
    const spy = vi.fn(() => Promise.resolve("ok"));
    const result = await withRateLimit(spy);
    expect(result).toBe("ok");
    expect(spy).toHaveBeenCalled();
  });

  it("respeta límite de concurrencia de 5", async () => {
    let activeCount = 0;
    let maxActive = 0;

    const trackingFn = () =>
      new Promise<number>((resolve) => {
        activeCount++;
        if (activeCount > maxActive) maxActive = activeCount;
        setTimeout(() => {
          activeCount--;
          resolve(activeCount);
        }, 50);
      });

    // Launch 10 concurrent calls
    const promises = Array.from({ length: 10 }, () => withRateLimit(trackingFn));
    await Promise.all(promises);

    expect(maxActive).toBeLessThanOrEqual(5);
  });
});
