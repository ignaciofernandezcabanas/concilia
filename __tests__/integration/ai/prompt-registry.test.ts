import { describe, it, expect } from "vitest";
import * as registry from "@/lib/ai/prompt-registry";

describe("Prompt Registry", () => {
  const prompts = Object.values(registry).filter(
    (v) => typeof v === "object" && v !== null && "task" in v && "system" in v && "buildUser" in v
  ) as Array<{
    task: string;
    version: string;
    system: string;
    buildUser: (...args: any[]) => string;
  }>;

  it("todas las prompts registradas tienen task, system, buildUser y version", () => {
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) {
      expect(p.task).toBeTruthy();
      expect(p.version).toBeTruthy();
      expect(typeof p.system).toBe("string");
      expect(typeof p.buildUser).toBe("function");
    }
  });

  it("buildUser wrappea datos financieros en XML tags", () => {
    // Test CLASSIFY_QUICK — should have <bank_transaction> or similar tag
    const classifyQuick = prompts.find((p) => p.task === "classify_quick");
    if (classifyQuick) {
      const result = classifyQuick.buildUser({
        txSummary: "PAGO PROVEEDOR -1200€",
        historySummary: "Historial...",
      });
      expect(result).toMatch(/<[a-z_]+>/); // Has XML tag
    }

    // Test MATCH_LLM — should have <bank_transaction> and <pending_invoices>
    const matchLlm = prompts.find((p) => p.task === "match_llm");
    if (matchLlm) {
      const result = matchLlm.buildUser({
        txSummary: "COBRO 5000€",
        invoiceSummary: "FRA-001: 5000€",
      });
      expect(result).toMatch(/<[a-z_]+>/);
    }
  });

  it("system prompts no están vacíos", () => {
    for (const p of prompts) {
      expect(p.system.length).toBeGreaterThan(10);
    }
  });

  it("hay prompts para las tasks principales", () => {
    const tasks = prompts.map((p) => p.task);
    expect(tasks).toContain("classify_quick");
    expect(tasks).toContain("explain_bandeja");
  });
});
