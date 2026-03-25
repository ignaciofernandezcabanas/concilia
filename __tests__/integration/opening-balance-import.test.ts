/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseBalanceCSV,
  parseSpanishAmount,
  detectSeparator,
  detectColumns,
} from "@/lib/import/balance-parser";
import { mapAccountsFromBalance } from "@/lib/import/account-mapper";
import { generateOpeningBalance } from "@/lib/import/opening-balance";
import type { ParsedAccount } from "@/lib/import/balance-parser";

// ── CSV Parsing Tests ──

describe("Balance CSV Parser", () => {
  describe("detectSeparator", () => {
    it("detects semicolon separator", () => {
      expect(detectSeparator("Cuenta;Nombre;Debe;Haber")).toBe(";");
    });

    it("detects comma separator", () => {
      expect(detectSeparator("Cuenta,Nombre,Debe,Haber")).toBe(",");
    });

    it("detects tab separator", () => {
      expect(detectSeparator("Cuenta\tNombre\tDebe\tHaber")).toBe("\t");
    });

    it("defaults to semicolon for ambiguous input", () => {
      expect(detectSeparator("CuentaNombreDebeHaber")).toBe(";");
    });
  });

  describe("parseSpanishAmount", () => {
    it("parses standard Spanish format: 1.234,56", () => {
      expect(parseSpanishAmount("1.234,56")).toBe(1234.56);
    });

    it("parses large Spanish amount: 1.234.567,89", () => {
      expect(parseSpanishAmount("1.234.567,89")).toBe(1234567.89);
    });

    it("parses plain integer", () => {
      expect(parseSpanishAmount("5000")).toBe(5000);
    });

    it("parses amount with comma decimal only: 500,75", () => {
      expect(parseSpanishAmount("500,75")).toBe(500.75);
    });

    it("returns 0 for empty string", () => {
      expect(parseSpanishAmount("")).toBe(0);
    });

    it("returns 0 for dash", () => {
      expect(parseSpanishAmount("-")).toBe(0);
    });

    it("parses negative with parentheses: (1.234,56)", () => {
      expect(parseSpanishAmount("(1.234,56)")).toBe(-1234.56);
    });

    it("parses negative with leading minus", () => {
      expect(parseSpanishAmount("-500,00")).toBe(-500);
    });

    it("parses English format: 1,234.56", () => {
      expect(parseSpanishAmount("1,234.56")).toBe(1234.56);
    });
  });

  describe("detectColumns", () => {
    it("detects standard Spanish headers", () => {
      const cols = detectColumns(["Cuenta", "Nombre", "Debe", "Haber", "Saldo"]);
      expect(cols).toEqual({ code: 0, name: 1, debit: 2, credit: 3, balance: 4 });
    });

    it("detects alternative headers: Código, Descripción, Débito, Crédito", () => {
      const cols = detectColumns(["Código", "Descripción", "Débito", "Crédito"]);
      expect(cols).toEqual({ code: 0, name: 1, debit: 2, credit: 3, balance: null });
    });

    it("returns null for missing required columns", () => {
      const cols = detectColumns(["Foo", "Bar", "Baz"]);
      expect(cols).toBeNull();
    });

    it("detects columns in any order", () => {
      const cols = detectColumns(["Debe", "Nombre", "Haber", "Cuenta"]);
      expect(cols).toEqual({ code: 3, name: 1, debit: 0, credit: 2, balance: null });
    });
  });

  describe("parseBalanceCSV", () => {
    it("parses a valid CSV with semicolon separator", () => {
      const csv = [
        "Cuenta;Nombre;Debe;Haber;Saldo",
        '4300;"Clientes";"10.000,00";"0,00";"10.000,00"',
        '5720;"Bancos";"50.000,00";"0,00";"50.000,00"',
        '4000;"Proveedores";"0,00";"60.000,00";"-60.000,00"',
      ].join("\n");

      const result = parseBalanceCSV(csv);
      expect(result.accounts).toHaveLength(3);
      expect(result.accounts[0].code).toBe("4300");
      expect(result.accounts[0].debitTotal).toBe(10000);
      expect(result.accounts[0].netBalance).toBe(10000);
      expect(result.accounts[2].netBalance).toBe(-60000);
      expect(result.confidence).toBe("medium"); // 3 accounts: > 0 but <= 10
      expect(result.warnings).toHaveLength(0);
    });

    it("parses CSV with comma separator", () => {
      const csv = [
        "Cuenta,Nombre,Debe,Haber",
        "4300,Clientes,10000.00,0.00",
        "5720,Bancos,50000.00,0.00",
      ].join("\n");

      const result = parseBalanceCSV(csv);
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].debitTotal).toBe(10000);
    });

    it("filters out zero-balance accounts", () => {
      const csv = [
        "Cuenta;Nombre;Debe;Haber",
        "4300;Clientes;10.000,00;0,00",
        "4310;Clientes dudosos;0,00;0,00",
        "5720;Bancos;50.000,00;0,00",
      ].join("\n");

      const result = parseBalanceCSV(csv);
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts.map((a) => a.code)).toEqual(["4300", "5720"]);
    });

    it("skips codes with fewer than 3 digits", () => {
      const csv = [
        "Cuenta;Nombre;Debe;Haber",
        "43;Grupo clientes;10.000,00;0,00",
        "4300;Clientes;10.000,00;0,00",
      ].join("\n");

      const result = parseBalanceCSV(csv);
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].code).toBe("4300");
    });

    it("returns low confidence for empty file", () => {
      const result = parseBalanceCSV("");
      expect(result.accounts).toHaveLength(0);
      expect(result.confidence).toBe("low");
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("returns warning when no valid columns detected", () => {
      const csv = ["Foo;Bar;Baz", "123;test;456"].join("\n");
      const result = parseBalanceCSV(csv);
      expect(result.accounts).toHaveLength(0);
      expect(result.warnings[0]).toContain("No se detectaron");
    });

    it("calculates netBalance from debit - credit when no saldo column", () => {
      const csv = ["Cuenta;Nombre;Debe;Haber", "4300;Clientes;10.000,00;3.000,00"].join("\n");

      const result = parseBalanceCSV(csv);
      expect(result.accounts[0].netBalance).toBe(7000);
    });

    it("detects period from header lines", () => {
      const csv = ["Cuenta;Nombre;Debe;Haber;Periodo 12/2025", "4300;Clientes;10.000,00;0,00"].join(
        "\n"
      );

      const result = parseBalanceCSV(csv);
      expect(result.period).toBe("2025-12");
    });

    it("returns high confidence for >10 accounts", () => {
      const lines = ["Cuenta;Nombre;Debe;Haber"];
      for (let i = 0; i < 12; i++) {
        lines.push(`${4300 + i};Cuenta ${i};${(i + 1) * 1000},00;0,00`);
      }
      const result = parseBalanceCSV(lines.join("\n"));
      expect(result.accounts.length).toBeGreaterThan(10);
      expect(result.confidence).toBe("high");
    });
  });
});

// ── Account Mapper Tests ──

describe("Account Mapper", () => {
  function createMockDb(
    existingAccounts: Array<{ code: string; group: number; parentCode?: string }>
  ) {
    const accounts = [...existingAccounts];
    return {
      account: {
        findMany: vi.fn().mockResolvedValue(
          accounts.map((a) => ({
            code: a.code,
            group: a.group,
            parentCode: a.parentCode ?? null,
          }))
        ),
        create: vi.fn().mockImplementation(({ data }: any) => {
          accounts.push({ code: data.code, group: data.group, parentCode: data.parentCode });
          return Promise.resolve({ id: `id-${data.code}`, ...data });
        }),
      },
    } as any;
  }

  it("case 1: existing account → existing list", async () => {
    const db = createMockDb([
      { code: "4300", group: 4 },
      { code: "5720", group: 5 },
    ]);

    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
    ];

    const result = await mapAccountsFromBalance(accounts, db);
    expect(result.existing).toEqual(["4300"]);
    expect(result.autoMapped).toHaveLength(0);
    expect(result.needsReview).toHaveLength(0);
  });

  it("case 2: parent match → auto-mapped", async () => {
    const db = createMockDb([{ code: "430", group: 4 }]);

    const accounts: ParsedAccount[] = [
      {
        code: "4300001",
        name: "Cliente Pérez SL",
        debitTotal: 5000,
        creditTotal: 0,
        netBalance: 5000,
      },
    ];

    const result = await mapAccountsFromBalance(accounts, db);
    expect(result.autoMapped).toEqual(["4300001"]);
    expect(db.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: "4300001",
        parentCode: "430",
        group: 4,
        isCustom: true,
      }),
    });
  });

  it("case 3: no match → needsReview", async () => {
    const db = createMockDb([{ code: "5720", group: 5 }]);

    const accounts: ParsedAccount[] = [
      {
        code: "9999",
        name: "Cuenta desconocida",
        debitTotal: 100,
        creditTotal: 0,
        netBalance: 100,
      },
    ];

    const result = await mapAccountsFromBalance(accounts, db);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0].code).toBe("9999");
    expect(result.needsReview[0].suggestedGroup).toContain("Grupo 9");
  });

  it("handles mixed cases", async () => {
    const db = createMockDb([
      { code: "4300", group: 4 },
      { code: "572", group: 5 },
    ]);

    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
      {
        code: "5720001",
        name: "Banco Santander",
        debitTotal: 50000,
        creditTotal: 0,
        netBalance: 50000,
      },
      { code: "8888", name: "Sin match", debitTotal: 100, creditTotal: 0, netBalance: 100 },
    ];

    const result = await mapAccountsFromBalance(accounts, db);
    expect(result.existing).toEqual(["4300"]);
    expect(result.autoMapped).toEqual(["5720001"]);
    expect(result.needsReview).toHaveLength(1);
  });
});

// ── Opening Balance Generator Tests ──

describe("Opening Balance Generator", () => {
  function createMockDb(
    accounts: Array<{ id: string; code: string }>,
    existingJEs: any[] = [],
    lastNumber = 0
  ) {
    return {
      account: {
        findMany: vi.fn().mockResolvedValue(accounts),
      },
      journalEntry: {
        findFirst: vi.fn().mockImplementation(({ where, orderBy }: any) => {
          if (orderBy?.number === "desc") {
            return Promise.resolve(lastNumber > 0 ? { number: lastNumber } : null);
          }
          // Check for existing JE by type + date
          if (where?.type === "OPENING") {
            return Promise.resolve(
              existingJEs.find(
                (je) => je.type === "OPENING" && je.date.getTime() === where.date.getTime()
              ) ?? null
            );
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockImplementation(({ data }: any) => {
          return Promise.resolve({ id: "je-new-1", ...data });
        }),
      },
    } as any;
  }

  const periodDate = new Date("2026-01-01");

  it("creates JE when balance squares", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
      { code: "5720", name: "Bancos", debitTotal: 50000, creditTotal: 0, netBalance: 50000 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 60000, netBalance: -60000 },
    ];

    const db = createMockDb([
      { id: "acc-1", code: "4300" },
      { id: "acc-2", code: "5720" },
      { id: "acc-3", code: "4000" },
    ]);

    const result = await generateOpeningBalance(accounts, periodDate, db);
    expect(result.journalEntryId).toBe("je-new-1");
    expect(result.warnings).toHaveLength(0);
    expect(db.journalEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "OPENING",
        status: "DRAFT",
        lines: {
          create: expect.arrayContaining([
            expect.objectContaining({ accountId: "acc-1", debit: 10000, credit: 0 }),
            expect.objectContaining({ accountId: "acc-2", debit: 50000, credit: 0 }),
            expect.objectContaining({ accountId: "acc-3", debit: 0, credit: 60000 }),
          ]),
        },
      }),
    });
  });

  it("rejects when balance does not square (gap >= 1 EUR)", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 5000, netBalance: -5000 },
    ];

    const db = createMockDb([
      { id: "acc-1", code: "4300" },
      { id: "acc-2", code: "4000" },
    ]);

    const result = await generateOpeningBalance(accounts, periodDate, db);
    expect(result.journalEntryId).toBeNull();
    expect(result.warnings[0]).toContain("no cuadra");
  });

  it("allows gap < 1 EUR (rounding tolerance)", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000.5, creditTotal: 0, netBalance: 10000.5 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 10000, netBalance: -10000 },
    ];

    const db = createMockDb([
      { id: "acc-1", code: "4300" },
      { id: "acc-2", code: "4000" },
    ]);

    const result = await generateOpeningBalance(accounts, periodDate, db);
    expect(result.journalEntryId).toBe("je-new-1");
  });

  it("rejects duplicate opening balance for same date", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 10000, netBalance: -10000 },
    ];

    const existingJE = { id: "je-existing", type: "OPENING", date: periodDate };
    const db = createMockDb(
      [
        { id: "acc-1", code: "4300" },
        { id: "acc-2", code: "4000" },
      ],
      [existingJE]
    );

    const result = await generateOpeningBalance(accounts, periodDate, db);
    expect(result.journalEntryId).toBeNull();
    expect(result.warnings[0]).toContain("Ya existe");
  });

  it("warns about missing accounts but creates JE with available ones", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
      { code: "9999", name: "Missing", debitTotal: 5000, creditTotal: 0, netBalance: 5000 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 15000, netBalance: -15000 },
    ];

    // Only 4300 and 4000 exist — the net balance check uses ALL accounts (gap = 0)
    // But lines will only be created for 4300 and 4000
    const db = createMockDb([
      { id: "acc-1", code: "4300" },
      { id: "acc-3", code: "4000" },
    ]);

    const result = await generateOpeningBalance(accounts, periodDate, db);
    // Balance: debit 10000+5000=15000, credit 15000 → gap=0, passes
    // But 9999 missing → warning
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("9999")]));
    // JE still created with 4300 and 4000
    expect(result.journalEntryId).toBe("je-new-1");
  });

  it("returns null JE for empty accounts list", async () => {
    const db = createMockDb([]);
    const result = await generateOpeningBalance([], periodDate, db);
    expect(result.journalEntryId).toBeNull();
    expect(result.warnings[0]).toContain("No hay cuentas");
  });

  it("skips zero-balance accounts in JE lines", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 10000, creditTotal: 0, netBalance: 10000 },
      { code: "4310", name: "Zero", debitTotal: 0, creditTotal: 0, netBalance: 0 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 10000, netBalance: -10000 },
    ];

    const db = createMockDb([
      { id: "acc-1", code: "4300" },
      { id: "acc-2", code: "4310" },
      { id: "acc-3", code: "4000" },
    ]);

    const result = await generateOpeningBalance(accounts, periodDate, db);
    expect(result.journalEntryId).toBe("je-new-1");

    const createCall = db.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.lines.create).toHaveLength(2);
  });

  it("increments JE number from last existing", async () => {
    const accounts: ParsedAccount[] = [
      { code: "4300", name: "Clientes", debitTotal: 5000, creditTotal: 0, netBalance: 5000 },
      { code: "4000", name: "Proveedores", debitTotal: 0, creditTotal: 5000, netBalance: -5000 },
    ];

    const db = createMockDb(
      [
        { id: "acc-1", code: "4300" },
        { id: "acc-2", code: "4000" },
      ],
      [],
      42
    );

    await generateOpeningBalance(accounts, periodDate, db);

    const createCall = db.journalEntry.create.mock.calls[0][0];
    expect(createCall.data.number).toBe(43);
  });
});
