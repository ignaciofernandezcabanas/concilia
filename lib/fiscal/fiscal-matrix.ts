/**
 * Fiscal Matrix — hardcoded mapping of company types to applicable fiscal models.
 *
 * Spanish fiscal calendar deadlines for PYMEs.
 */

// ── Company types for fiscal purposes ──

export type FiscalCompanyType =
  | "SL_GENERAL"
  | "SL_CON_EMPLEADOS"
  | "SL_ARRENDADOR"
  | "SL_INTRACOMUNITARIA"
  | "SL_SII"
  | "AUTONOMO"
  | "SL_HOLDING";

// ── Fiscal models ──

export interface FiscalModelInfo {
  model: string;
  name: string;
  frequency: "trimestral" | "anual" | "mensual";
  description: string;
}

export const FISCAL_MODELS: Record<string, FiscalModelInfo> = {
  "303": {
    model: "303",
    name: "IVA trimestral",
    frequency: "trimestral",
    description: "Autoliquidación IVA — repercutido vs soportado",
  },
  "111": {
    model: "111",
    name: "Retenciones IRPF trabajo/profesionales",
    frequency: "trimestral",
    description:
      "Retenciones e ingresos a cuenta del IRPF sobre rendimientos del trabajo y actividades profesionales",
  },
  "115": {
    model: "115",
    name: "Retenciones IRPF alquileres",
    frequency: "trimestral",
    description:
      "Retenciones e ingresos a cuenta sobre rentas de arrendamientos de inmuebles urbanos",
  },
  "200": {
    model: "200",
    name: "Impuesto de Sociedades",
    frequency: "anual",
    description: "Declaración anual del Impuesto sobre Sociedades",
  },
  "347": {
    model: "347",
    name: "Operaciones con terceros",
    frequency: "anual",
    description: "Declaración anual de operaciones con terceros (>3.005,06€)",
  },
  "349": {
    model: "349",
    name: "Operaciones intracomunitarias",
    frequency: "trimestral",
    description: "Declaración recapitulativa de operaciones intracomunitarias",
  },
  "390": {
    model: "390",
    name: "Resumen anual IVA",
    frequency: "anual",
    description: "Resumen anual de IVA (complementa 303)",
  },
  "130": {
    model: "130",
    name: "Pago fraccionado IRPF",
    frequency: "trimestral",
    description: "Pago fraccionado del IRPF para autónomos en estimación directa",
  },
  "202": {
    model: "202",
    name: "Pago fraccionado IS",
    frequency: "trimestral",
    description: "Pago fraccionado del Impuesto sobre Sociedades",
  },
} as const;

// ── Matrix: company type → applicable models ──

export const FISCAL_MATRIX: Record<FiscalCompanyType, string[]> = {
  SL_GENERAL: ["303", "200", "347", "390"],
  SL_CON_EMPLEADOS: ["303", "111", "200", "347", "390"],
  SL_ARRENDADOR: ["303", "111", "115", "200", "347", "390"],
  SL_INTRACOMUNITARIA: ["303", "111", "200", "347", "349", "390"],
  SL_SII: ["303", "111", "200", "347", "390"],
  AUTONOMO: ["303", "130", "347", "390"],
  SL_HOLDING: ["303", "200", "202", "347", "390"],
} as const;

// ── Fiscal calendar ──

export interface FiscalDeadline {
  model: string;
  period: string;
  dueDate: string;
  description: string;
}

/**
 * Returns all fiscal deadlines for a given year.
 *
 * Spanish calendar:
 * - 303/111/115 trimestrales: 20 Apr (T1), 20 Jul (T2), 20 Oct (T3), 30 Jan+1 (T4)
 * - 200 (IS): 25 Jul
 * - 347: 28 Feb
 * - 390: 30 Jan+1
 * - 349: same as 303
 * - 130: same as 303
 * - 202: 20 Apr / 20 Oct / 20 Dec
 */
export function getFiscalDeadlines(year: number): FiscalDeadline[] {
  const deadlines: FiscalDeadline[] = [];

  // Quarterly models: 303, 111, 115, 349, 130
  const quarterlyModels = ["303", "111", "115", "349", "130"];
  const quarterlyDates: Array<{ period: string; month: number; day: number; yearOffset: number }> =
    [
      { period: `T1-${year}`, month: 4, day: 20, yearOffset: 0 },
      { period: `T2-${year}`, month: 7, day: 20, yearOffset: 0 },
      { period: `T3-${year}`, month: 10, day: 20, yearOffset: 0 },
      { period: `T4-${year}`, month: 1, day: 30, yearOffset: 1 },
    ];

  for (const model of quarterlyModels) {
    const info = FISCAL_MODELS[model];
    if (!info) continue;
    for (const qd of quarterlyDates) {
      const dueYear = year + qd.yearOffset;
      const dueDate = `${dueYear}-${String(qd.month).padStart(2, "0")}-${String(qd.day).padStart(2, "0")}`;
      deadlines.push({
        model,
        period: qd.period,
        dueDate,
        description: `${info.name} (${qd.period})`,
      });
    }
  }

  // 200 (IS): 25 Jul
  deadlines.push({
    model: "200",
    period: `${year}`,
    dueDate: `${year + 1}-07-25`,
    description: `Impuesto de Sociedades (${year})`,
  });

  // 347: 28 Feb of next year
  deadlines.push({
    model: "347",
    period: `${year}`,
    dueDate: `${year + 1}-02-28`,
    description: `Operaciones con terceros (${year})`,
  });

  // 390: 30 Jan of next year
  deadlines.push({
    model: "390",
    period: `${year}`,
    dueDate: `${year + 1}-01-30`,
    description: `Resumen anual IVA (${year})`,
  });

  // 202 (pago fraccionado IS): 20 Apr, 20 Oct, 20 Dec
  const pagoFraccionadoDates: Array<{ period: string; month: number; day: number }> = [
    { period: `P1-${year}`, month: 4, day: 20 },
    { period: `P2-${year}`, month: 10, day: 20 },
    { period: `P3-${year}`, month: 12, day: 20 },
  ];
  for (const pf of pagoFraccionadoDates) {
    deadlines.push({
      model: "202",
      period: pf.period,
      dueDate: `${year}-${String(pf.month).padStart(2, "0")}-${String(pf.day).padStart(2, "0")}`,
      description: `Pago fraccionado IS (${pf.period})`,
    });
  }

  return deadlines;
}

/**
 * Returns models applicable to a company type.
 */
export function getApplicableModels(companyType: FiscalCompanyType): FiscalModelInfo[] {
  const modelCodes = FISCAL_MATRIX[companyType] ?? FISCAL_MATRIX.SL_GENERAL;
  return modelCodes.map((code) => FISCAL_MODELS[code]).filter(Boolean) as FiscalModelInfo[];
}

/**
 * Returns upcoming deadlines within a number of days for a company type.
 */
export function getUpcomingDeadlines(
  companyType: FiscalCompanyType,
  withinDays: number,
  referenceDate?: Date
): FiscalDeadline[] {
  const now = referenceDate ?? new Date();
  const applicableModels = FISCAL_MATRIX[companyType] ?? FISCAL_MATRIX.SL_GENERAL;
  const year = now.getFullYear();

  // Check current year and next year deadlines
  const allDeadlines = [...getFiscalDeadlines(year - 1), ...getFiscalDeadlines(year)];

  return allDeadlines.filter((d) => {
    if (!applicableModels.includes(d.model)) return false;
    const due = new Date(d.dueDate);
    const diffMs = due.getTime() - now.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays <= withinDays;
  });
}
