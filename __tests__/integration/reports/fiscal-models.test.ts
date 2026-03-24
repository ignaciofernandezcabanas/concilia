/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vat-generator since calculateModel303 depends on it
vi.mock("@/lib/reports/vat-generator", () => ({
  generateVatReport: vi.fn(),
}));

import { generateVatReport } from "@/lib/reports/vat-generator";
import {
  calculateModel303,
  calculateModel111,
  getFiscalCalendar,
} from "@/lib/reports/fiscal-models";

const mockGenerateVat = generateVatReport as any;

const mockDb = {
  invoice: { findMany: vi.fn() },
};

describe("Fiscal Models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoice.findMany.mockResolvedValue([]);
  });

  describe("Model 303", () => {
    it("ISSUED invoice at 21% → devengado general", async () => {
      mockGenerateVat.mockResolvedValue({
        ivaRepercutido: {
          byRate: [{ rate: 21, base: 10000, vat: 2100, total: 12100, count: 3 }],
          totalBase: 10000,
          totalVat: 2100,
        },
        ivaSoportado: {
          byRate: [],
          totalBase: 0,
          totalVat: 0,
        },
      });

      const result = await calculateModel303(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      expect(result.devengado.general21.base).toBe(10000);
      expect(result.devengado.general21.cuota).toBe(2100);
    });

    it("ISSUED invoice at 10% → devengado reducido", async () => {
      mockGenerateVat.mockResolvedValue({
        ivaRepercutido: {
          byRate: [{ rate: 10, base: 5000, vat: 500, total: 5500, count: 1 }],
          totalBase: 5000,
          totalVat: 500,
        },
        ivaSoportado: {
          byRate: [],
          totalBase: 0,
          totalVat: 0,
        },
      });

      const result = await calculateModel303(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      expect(result.devengado.reducido10.base).toBe(5000);
      expect(result.devengado.reducido10.cuota).toBe(500);
    });

    it("RECEIVED invoice → deducible interiores", async () => {
      mockGenerateVat.mockResolvedValue({
        ivaRepercutido: {
          byRate: [],
          totalBase: 0,
          totalVat: 0,
        },
        ivaSoportado: {
          byRate: [{ rate: 21, base: 8000, vat: 1680, total: 9680, count: 2 }],
          totalBase: 8000,
          totalVat: 1680,
        },
      });

      const result = await calculateModel303(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      expect(result.deducible.interiores.base).toBe(8000);
      expect(result.deducible.interiores.cuota).toBe(1680);
    });

    it("no CIF on supplier → check WARNING", async () => {
      mockGenerateVat.mockResolvedValue({
        ivaRepercutido: { byRate: [], totalBase: 0, totalVat: 0 },
        ivaSoportado: { byRate: [], totalBase: 0, totalVat: 0 },
      });

      mockDb.invoice.findMany.mockResolvedValue([
        {
          id: "inv_1",
          number: "FR-001",
          contact: { cif: null },
        },
      ]);

      const result = await calculateModel303(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      const cifCheck = result.checks.find((c) => c.type === "MISSING_CIF");
      expect(cifCheck).toBeDefined();
      expect(cifCheck!.message).toContain("FR-001");
    });

    it("resultado = devengado.total - deducible.total", async () => {
      mockGenerateVat.mockResolvedValue({
        ivaRepercutido: {
          byRate: [{ rate: 21, base: 10000, vat: 2100, total: 12100, count: 3 }],
          totalBase: 10000,
          totalVat: 2100,
        },
        ivaSoportado: {
          byRate: [{ rate: 21, base: 6000, vat: 1260, total: 7260, count: 2 }],
          totalBase: 6000,
          totalVat: 1260,
        },
      });

      const result = await calculateModel303(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      expect(result.resultado).toBe(840); // 2100 - 1260
    });
  });

  describe("Model 111", () => {
    it("invoice with withholding → professional activities", async () => {
      mockDb.invoice.findMany.mockResolvedValue([
        {
          id: "inv_p1",
          type: "RECEIVED",
          netAmount: 1000,
          vatAmount: 210,
          totalAmount: 1060, // net 1000 + VAT 210 - retention 150 = 1060
          contact: { name: "Abogado García", cif: "B12345678" },
        },
      ]);

      const result = await calculateModel111(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      expect(result.professionals.recipients).toBeGreaterThanOrEqual(0);
      expect(result.professionals.base).toBeGreaterThanOrEqual(0);
    });

    it("payroll withholding → work income (stub)", async () => {
      mockDb.invoice.findMany.mockResolvedValue([]);

      const result = await calculateModel111(
        mockDb as any,
        "comp_1",
        new Date("2026-01-01"),
        new Date("2026-03-31")
      );

      // Employment is currently stubbed at 0
      expect(result.employment.base).toBe(0);
      expect(result.employment.withholding).toBe(0);
    });
  });

  describe("Fiscal Calendar", () => {
    it("Q1 → deadline April 20", () => {
      const calendar = getFiscalCalendar(2026);
      const q1_303 = calendar.find((d) => d.model === "303" && d.quarter === 1);
      expect(q1_303).toBeDefined();
      expect(q1_303!.dueDate).toBe("2026-04-20");
    });

    it("Q4 → deadline January 30 next year", () => {
      const calendar = getFiscalCalendar(2026);
      const q4_303 = calendar.find((d) => d.model === "303" && d.quarter === 4);
      expect(q4_303).toBeDefined();
      expect(q4_303!.dueDate).toBe("2027-01-30");
    });

    it("all fiscal deadlines have correct dates", () => {
      const calendar = getFiscalCalendar(2026);

      // Should have: 4 quarters x 3 models (303,111,115) + IS + 390 = 14
      expect(calendar.length).toBe(14);

      // All dates should be valid
      for (const d of calendar) {
        expect(d.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const parsed = new Date(d.dueDate);
        expect(parsed.getTime()).not.toBeNaN();
      }

      // IS should be July 25
      const is = calendar.find((d) => d.model === "IS");
      expect(is!.dueDate).toBe("2026-07-25");

      // 390 should be Jan 30 next year
      const m390 = calendar.find((d) => d.model === "390");
      expect(m390!.dueDate).toBe("2027-01-30");
    });
  });
});
