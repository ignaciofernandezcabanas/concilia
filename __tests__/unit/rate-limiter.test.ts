import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma for DB-backed circuit breaker
const mockPrisma = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

describe("withRateLimit (DB-backed circuit breaker)", () => {
  let withRateLimit: typeof import("@/lib/ai/rate-limiter").withRateLimit;

  beforeEach(async () => {
    vi.resetModules();
    // Reset mocks
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

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
    let dbErrors = 0;
    let dbBrokenUntil: Date | null = null;

    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("_circuit_breaker")) {
        return Promise.resolve([
          { consecutive_errors: dbErrors, broken_until: dbBrokenUntil, last_error_at: null },
        ]);
      }
      return Promise.resolve([]);
    });
    mockPrisma.$executeRawUnsafe.mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes("INSERT INTO _circuit_breaker") && typeof args[0] === "number") {
        dbErrors = args[0] as number;
        dbBrokenUntil = (args[1] as Date) ?? null;
      }
      return Promise.resolve(undefined);
    });

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
    let dbErrors = 0;
    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("_circuit_breaker")) {
        return Promise.resolve([
          { consecutive_errors: dbErrors, broken_until: null, last_error_at: null },
        ]);
      }
      return Promise.resolve([]);
    });
    mockPrisma.$executeRawUnsafe.mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes("INSERT INTO _circuit_breaker") && typeof args[0] === "number") {
        dbErrors = args[0] as number;
      }
      return Promise.resolve(undefined);
    });

    await withRateLimit(() => Promise.reject(new Error("fail"))); // error 1
    await withRateLimit(() => Promise.reject(new Error("fail"))); // error 2
    await withRateLimit(() => Promise.resolve("ok")); // success → reset

    expect(dbErrors).toBe(0);
  });

  it("fail-open: si DB falla, permite la llamada", async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("DB down"));
    mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error("DB down"));

    const result = await withRateLimit(() => Promise.resolve("works"));
    expect(result).toBe("works");
  });
});
