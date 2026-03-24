/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  account: { findFirst: vi.fn() },
  journalEntryLine: { findMany: vi.fn() },
};

import { checkCapitalAdequacy } from "@/lib/accounting/capital-adequacy";

describe("Capital Adequacy", () => {
  function setAccountBalances(balances: Record<string, number>) {
    mockDb.account.findFirst.mockImplementation(async ({ where }: any) => {
      if (balances[where.code] !== undefined) {
        return { id: `acct_${where.code}` };
      }
      return null;
    });

    mockDb.journalEntryLine.findMany.mockImplementation(async ({ where }: any) => {
      const acctId = where.accountId as string;
      const code = acctId.replace("acct_", "");
      const balance = balances[code] ?? 0;
      if (balance >= 0) return [{ debit: balance, credit: 0 }];
      return [{ debit: 0, credit: Math.abs(balance) }];
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PN > 50% capital → ratio ok, no critical alert", async () => {
    // Capital 100K (credit = -100K), reserves 50K (credit = -50K)
    // PN = 100K + 50K = 150K, ratio = 1.5
    setAccountBalances({
      "100": -100000,
      "110": 0,
      "112": -50000,
      "113": 0,
      "114": 0,
      "119": 0,
      "120": 0,
      "130": 0,
      "131": 0,
      "121": 0,
      "108": 0,
      "109": 0,
      "129": 0,
    });

    const result = await checkCapitalAdequacy(mockDb as any);

    expect(result.ratio).toBeGreaterThan(0.5);
    const critical = result.alerts.find((a) => a.level === "CRITICAL");
    expect(critical).toBeUndefined();
  });

  it("PN <= 50% capital → CRITICAL alert", async () => {
    // Capital 100K, losses 121 = 60K debit → PN = 100K - 60K = 40K, ratio = 0.4
    setAccountBalances({
      "100": -100000,
      "110": 0,
      "112": 0,
      "113": 0,
      "114": 0,
      "119": 0,
      "120": 0,
      "130": 0,
      "131": 0,
      "121": 60000,
      "108": 0,
      "109": 0,
      "129": 0,
    });

    const result = await checkCapitalAdequacy(mockDb as any);

    expect(result.ratio).toBeLessThanOrEqual(0.5);
    const critical = result.alerts.find((a) => a.level === "CRITICAL");
    expect(critical).toBeDefined();
  });

  it("PN < capital but > 50% → MEDIUM alert", async () => {
    // Capital 100K, losses 121 = 30K → PN = 100K - 30K = 70K, ratio = 0.7
    setAccountBalances({
      "100": -100000,
      "110": 0,
      "112": 0,
      "113": 0,
      "114": 0,
      "119": 0,
      "120": 0,
      "130": 0,
      "131": 0,
      "121": 30000,
      "108": 0,
      "109": 0,
      "129": 0,
    });

    const result = await checkCapitalAdequacy(mockDb as any);

    expect(result.ratio).toBeGreaterThan(0.5);
    expect(result.ratio).toBeLessThanOrEqual(1.0);
    const medium = result.alerts.find((a) => a.level === "MEDIUM");
    expect(medium).toBeDefined();
  });

  it("reserva legal complete (>= 20% capital) → no INFO alert for reserva", async () => {
    // Capital 100K, reserva legal 25K (>= 20K)
    setAccountBalances({
      "100": -100000,
      "110": 0,
      "112": -25000,
      "113": 0,
      "114": 0,
      "119": 0,
      "120": 0,
      "130": 0,
      "131": 0,
      "121": 0,
      "108": 0,
      "109": 0,
      "129": 0,
    });

    const result = await checkCapitalAdequacy(mockDb as any);

    const infoReserva = result.alerts.find(
      (a) => a.level === "INFO" && a.message.includes("Reserva legal")
    );
    expect(infoReserva).toBeUndefined();
  });

  it("account 121 subtracts correctly from PN", async () => {
    // Capital 100K, 121 losses = 20K
    setAccountBalances({
      "100": -100000,
      "110": 0,
      "112": 0,
      "113": 0,
      "114": 0,
      "119": 0,
      "120": 0,
      "130": 0,
      "131": 0,
      "121": 20000,
      "108": 0,
      "109": 0,
      "129": 0,
    });

    const result = await checkCapitalAdequacy(mockDb as any);

    expect(result.patrimonioNeto).toBe(80000); // 100K - 20K
    expect(result.capital).toBe(100000);
  });

  it("includes all group 1 equity accounts", async () => {
    // Set various equity accounts to verify they all contribute
    setAccountBalances({
      "100": -50000, // capital
      "110": -10000, // prima emisión
      "112": -8000, // reserva legal
      "113": -12000, // reservas voluntarias
      "114": -5000, // reservas especiales
      "119": -3000, // diferencias
      "120": -2000, // remanente
      "130": -1000, // subvenciones
      "131": -500, // donaciones
      "121": 4000, // pérdidas anteriores (debit = reduces PN)
      "108": 1000, // acciones propias (debit = reduces PN)
      "109": 500, // acciones propias situaciones especiales
      "129": -7000, // resultado ejercicio (credit = profit)
    });

    const result = await checkCapitalAdequacy(mockDb as any);

    // PN = (50K + 10K + 8K + 12K + 5K + 3K + 2K + 1K + 0.5K) - (4K + 1K + 0.5K) + 7K
    // = 91.5K - 5.5K + 7K = 93K
    expect(result.patrimonioNeto).toBe(93000);
  });
});
