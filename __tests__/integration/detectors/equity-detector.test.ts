/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";

import { detectEquityMovement } from "@/lib/reconciliation/detectors/equity-detector";

const mockDb = {} as any;

function makeTx(overrides: Partial<any> = {}): any {
  return {
    id: "tx_1",
    amount: -5000,
    concept: "",
    conceptParsed: "",
    valueDate: new Date("2026-03-15"),
    ...overrides,
  };
}

describe("Equity Detector", () => {
  it('concept "DIVIDENDO SOCIO" → detected, suggestedType ACTA_JUNTA', async () => {
    const tx = makeTx({ concept: "DIVIDENDO SOCIO GARCIA" });
    const result = await detectEquityMovement(tx, mockDb);

    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.suggestedType).toBe("ACTA_JUNTA");
  });

  it('concept "AMPLIACION CAPITAL" → detected, suggestedType ESCRITURA', async () => {
    const tx = makeTx({ concept: "AMPLIACION CAPITAL SOCIAL", amount: 50000 });
    const result = await detectEquityMovement(tx, mockDb);

    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.suggestedType).toBe("ESCRITURA");
  });

  it('concept "AEAT MODELO 303" → detected, suggestedType MODELO_FISCAL', async () => {
    const tx = makeTx({ concept: "AEAT MODELO 303 T1 2026", amount: -8000 });
    const result = await detectEquityMovement(tx, mockDb);

    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.suggestedType).toBe("MODELO_FISCAL");
  });

  it("normal operating concept → not detected (returns null)", async () => {
    const tx = makeTx({ concept: "COMPRA MATERIAL OFICINA" });
    const result = await detectEquityMovement(tx, mockDb);

    expect(result).toBeNull();
  });

  it("confidence always 0.0, priority always DECISION", async () => {
    const tx = makeTx({ concept: "DIVIDENDO TRIMESTRAL" });
    const result = await detectEquityMovement(tx, mockDb);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.0);
    expect(result!.priority).toBe("DECISION");
  });
});
