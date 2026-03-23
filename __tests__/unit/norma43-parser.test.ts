import { describe, it, expect } from "vitest";
import { parseNorma43, isNorma43 } from "@/lib/bank/norma43-parser";

/**
 * Build N43 line at exact byte positions matching the parser.
 */
function buildLine(type: string, fills: Array<[number, string]>): string {
  const line = new Array(80).fill("0");
  line[0] = type[0];
  line[1] = type[1];
  for (const [pos, val] of fills) {
    for (let i = 0; i < val.length; i++) {
      line[pos + i] = val[i];
    }
  }
  return line.join("");
}

// Header: bank=0049, branch=2345, account=0123456789
// sign=2 (credit=positive), balance=5000000 cents=50000.00€, currency=978
const HEADER = buildLine("11", [
  [2, "0049"], [6, "2345"], [10, "0123456789"],
  [32, "2"], [33, "00000005000000"], [47, "978"],
]);

// TX1: date=150326, sign=1 (debit), amount=120000 cents=1200.00€
const TX1 = buildLine("22", [
  [10, "150326"], [27, "1"], [28, "00000000120000"], [42, "1234"],
  [46, "PAGO PROVEEDOR TEST SL"],
]);

// TX1 supplement
const TX1_SUPP = buildLine("23", [[16, "FACTURA FRA-2026-001"]]);

// TX2: date=160326, sign=2 (credit), amount=50000 cents=500.00€
const TX2 = buildLine("22", [
  [10, "160326"], [27, "2"], [28, "00000000050000"],
  [46, "COBRO CLIENTE ABC"],
]);

// Footer: sign=2, balance=4930000 cents=49300.00€
const FOOTER = buildLine("33", [[20, "2"], [21, "00000004930000"]]);

const END = buildLine("88", []);

const SAMPLE_N43 = [HEADER, TX1, TX1_SUPP, TX2, FOOTER, END].join("\n");

describe("Norma43 Parser", () => {
  it("parsea archivo N43 completo → 2 transacciones", () => {
    const result = parseNorma43(SAMPLE_N43);
    expect(result.transactions).toHaveLength(2);
  });

  it("extrae código de banco", () => {
    expect(parseNorma43(SAMPLE_N43).bankCode).toBe("0049");
  });

  it("extrae moneda EUR (978)", () => {
    expect(parseNorma43(SAMPLE_N43).currency).toBe("EUR");
  });

  it("saldo inicial: céntimos → euros", () => {
    expect(parseNorma43(SAMPLE_N43).initialBalance).toBe(50000.00);
  });

  it("saldo final: céntimos → euros", () => {
    expect(parseNorma43(SAMPLE_N43).finalBalance).toBe(49300.00);
  });

  it("cargo (signo 1) → amount negativo", () => {
    const cargo = parseNorma43(SAMPLE_N43).transactions.find((t) => t.amount < 0);
    expect(cargo).toBeDefined();
    expect(cargo!.amount).toBe(-1200.00);
  });

  it("abono (signo 2) → amount positivo", () => {
    const abono = parseNorma43(SAMPLE_N43).transactions.find((t) => t.amount > 0);
    expect(abono).toBeDefined();
    expect(abono!.amount).toBe(500.00);
  });

  it("concepto + complemento tipo 23 concatenados", () => {
    const tx = parseNorma43(SAMPLE_N43).transactions[0];
    expect(tx.concept).toContain("PAGO PROVEEDOR TEST SL");
    expect(tx.concept).toContain("FACTURA FRA-2026-001");
  });

  it("fecha DDMMYY parseada correctamente", () => {
    const tx = parseNorma43(SAMPLE_N43).transactions[0];
    expect(tx.date.getFullYear()).toBe(2026);
    expect(tx.date.getMonth()).toBe(2);
    expect(tx.date.getDate()).toBe(15);
  });

  it("archivo vacío → lanza error", () => {
    expect(() => parseNorma43("")).toThrow();
  });

  it("archivo sin cabecera 11 → lanza error", () => {
    expect(() => parseNorma43("22esto no es un N43 válido")).toThrow();
  });
});

describe("isNorma43", () => {
  it("detecta archivo N43 válido", () => {
    expect(isNorma43(SAMPLE_N43)).toBe(true);
  });

  it("rechaza CSV", () => {
    expect(isNorma43("fecha;concepto;importe\n15/03/2026;pago;-1200")).toBe(false);
  });

  it("rechaza vacío", () => {
    expect(isNorma43("")).toBe(false);
  });
});
