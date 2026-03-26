/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fiscal models for Spanish tax compliance.
 *
 * - Model 303: Quarterly VAT (IVA)
 * - Model 111: Withholdings on employment & professional services
 * - Model 115: Withholdings on rents
 * - Model 390: Annual VAT summary
 * - Fiscal Calendar: deadlines per year
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import { generateVatReport, type VatReport } from "./vat-generator";
import { generatePyG } from "./pyg-generator";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Model 303 — Quarterly VAT
// ---------------------------------------------------------------------------

export interface Model303 {
  period: { from: string; to: string };
  devengado: {
    general21: { base: number; cuota: number };
    reducido10: { base: number; cuota: number };
    superReducido4: { base: number; cuota: number };
    otrosNoClasificados: { base: number; cuota: number };
    total: number;
  };
  deducible: {
    interiores: { base: number; cuota: number };
    importaciones: { base: number; cuota: number };
    otrosNoClasificados: { base: number; cuota: number };
    total: number;
  };
  resultado: number;
  compensacion: number;
  totalIngresar: number;
  checks: Array<{ type: string; message: string; invoiceId?: string }>;
}

/**
 * Calculates Model 303 for a given period.
 * Reuses the existing VAT generator and restructures output.
 */
export async function calculateModel303(
  db: ScopedPrisma,
  companyId: string,
  from: Date,
  to: Date
): Promise<Model303> {
  const vat: VatReport = await generateVatReport(db, companyId, from, to);
  const checks: Model303["checks"] = [];

  // Map VAT rates to the three Spanish buckets
  const findRate = (rates: typeof vat.ivaRepercutido.byRate, rate: number) =>
    rates.find((r) => r.rate === rate);

  const rep21 = findRate(vat.ivaRepercutido.byRate, 21);
  const rep10 = findRate(vat.ivaRepercutido.byRate, 10);
  const rep4 = findRate(vat.ivaRepercutido.byRate, 4);

  const devengadoTotal = vat.ivaRepercutido.totalVat;

  // Deducible: all soportado is "interiores" for now (no import detection)
  const deducibleTotal = vat.ivaSoportado.totalVat;

  // Check for invoices with unusual VAT rates
  for (const group of vat.ivaRepercutido.byRate) {
    if (![0, 4, 10, 21].includes(group.rate)) {
      checks.push({
        type: "UNUSUAL_RATE",
        message: `Tipo IVA ${group.rate}% no estándar detectado en ${group.count} factura(s) emitida(s)`,
      });
    }
  }
  for (const group of vat.ivaSoportado.byRate) {
    if (![0, 4, 10, 21].includes(group.rate)) {
      checks.push({
        type: "UNUSUAL_RATE",
        message: `Tipo IVA ${group.rate}% no estándar detectado en ${group.count} factura(s) recibida(s)`,
      });
    }
  }

  // Check invoices without supplier CIF
  const receivedInvoices = await db.invoice.findMany({
    where: {
      type: { in: ["RECEIVED", "CREDIT_RECEIVED"] },
      issueDate: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    include: { contact: { select: { cif: true } } },
  });
  for (const inv of receivedInvoices) {
    if (!inv.contact?.cif) {
      checks.push({
        type: "MISSING_CIF",
        message: `Factura ${inv.number} sin CIF de proveedor`,
        invoiceId: inv.id,
      });
    }
  }

  // Calculate unclassified remainder (catch-all for devengado)
  const classifiedDevBase = r2((rep21?.base ?? 0) + (rep10?.base ?? 0) + (rep4?.base ?? 0));
  const classifiedDevVat = r2((rep21?.vat ?? 0) + (rep10?.vat ?? 0) + (rep4?.vat ?? 0));
  const unclassifiedDevBase = r2(vat.ivaRepercutido.totalBase - classifiedDevBase);
  const unclassifiedDevVat = r2(devengadoTotal - classifiedDevVat);

  // Unclassified for deducible
  const ded21 = findRate(vat.ivaSoportado.byRate, 21);
  const ded10 = findRate(vat.ivaSoportado.byRate, 10);
  const ded4 = findRate(vat.ivaSoportado.byRate, 4);
  const classifiedDedBase = r2((ded21?.base ?? 0) + (ded10?.base ?? 0) + (ded4?.base ?? 0));
  const classifiedDedVat = r2((ded21?.vat ?? 0) + (ded10?.vat ?? 0) + (ded4?.vat ?? 0));
  const unclassifiedDedBase = r2(vat.ivaSoportado.totalBase - classifiedDedBase);
  const unclassifiedDedVat = r2(deducibleTotal - classifiedDedVat);

  const resultado = r2(devengadoTotal - deducibleTotal);
  const compensacion = 0; // Future: read from prior period negative balances
  const totalIngresar = r2(resultado - compensacion);

  return {
    period: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    devengado: {
      general21: {
        base: r2(rep21?.base ?? 0),
        cuota: r2(rep21?.vat ?? 0),
      },
      reducido10: {
        base: r2(rep10?.base ?? 0),
        cuota: r2(rep10?.vat ?? 0),
      },
      superReducido4: {
        base: r2(rep4?.base ?? 0),
        cuota: r2(rep4?.vat ?? 0),
      },
      otrosNoClasificados: {
        base: unclassifiedDevBase,
        cuota: unclassifiedDevVat,
      },
      total: r2(devengadoTotal),
    },
    deducible: {
      interiores: {
        base: r2(classifiedDedBase),
        cuota: r2(classifiedDedVat),
      },
      importaciones: { base: 0, cuota: 0 },
      otrosNoClasificados: {
        base: unclassifiedDedBase,
        cuota: unclassifiedDedVat,
      },
      total: r2(deducibleTotal),
    },
    resultado,
    compensacion,
    totalIngresar,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Model 111 — Withholdings on employment and professional services
// ---------------------------------------------------------------------------

export interface Model111 {
  period: { from: string; to: string };
  employment: { recipients: number; base: number; withholding: number };
  professionals: { recipients: number; base: number; withholding: number };
  total: { base: number; withholding: number };
  checks: Array<{ type: string; message: string }>;
}

export async function calculateModel111(
  db: ScopedPrisma,
  companyId: string,
  from: Date,
  to: Date
): Promise<Model111> {
  const checks: Model111["checks"] = [];

  // Professional withholdings from received invoices
  const invoices = await db.invoice.findMany({
    where: {
      type: "RECEIVED",
      issueDate: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    include: {
      contact: { select: { name: true, cif: true } },
    },
  });

  let profBase = 0;
  let profWithholding = 0;
  const profRecipients = new Set<string>();

  for (const inv of invoices) {
    const netAmt = inv.netAmount ?? 0;
    const vatAmt = inv.vatAmount ?? 0;
    const estimatedWithholding = netAmt > 0 ? Math.max(0, inv.totalAmount - vatAmt - netAmt) : 0;

    if (estimatedWithholding > 0.01) {
      const base = inv.totalAmount - vatAmt;
      profBase += base;
      profWithholding += estimatedWithholding;
      if (inv.contact?.cif) profRecipients.add(inv.contact.cif);
    }
  }

  // Employment withholdings (stub — payroll not yet integrated)
  const empBase = 0;
  const empWithholding = 0;
  const empRecipients = 0;

  return {
    period: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    employment: {
      recipients: empRecipients,
      base: r2(empBase),
      withholding: r2(empWithholding),
    },
    professionals: {
      recipients: profRecipients.size,
      base: r2(profBase),
      withholding: r2(profWithholding),
    },
    total: {
      base: r2(empBase + profBase),
      withholding: r2(empWithholding + profWithholding),
    },
    checks,
  };
}

// ---------------------------------------------------------------------------
// Model 115 — Withholdings on rents
// ---------------------------------------------------------------------------

export interface Model115 {
  period: { from: string; to: string };
  rents: {
    recipients: number;
    base: number;
    withholding: number;
  };
  checks: Array<{ type: string; message: string }>;
}

export async function calculateModel115(
  db: ScopedPrisma,
  companyId: string,
  from: Date,
  to: Date
): Promise<Model115> {
  const checks: Model115["checks"] = [];

  // Look for invoices classified to rent account (621)
  const rentInvoices = await db.invoice.findMany({
    where: {
      type: "RECEIVED",
      issueDate: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    include: {
      lines: true,
      contact: { select: { name: true, cif: true } },
    },
  });

  let rentBase = 0;
  let rentWithholding = 0;
  const recipients = new Set<string>();

  for (const inv of rentInvoices) {
    // Check if any line is classified to account 621 (rent)
    const hasRentLine = inv.lines.some(
      (l: any) => l.accountCode === "621" || l.description?.toLowerCase().includes("alquiler")
    );
    if (!hasRentLine) continue;

    const netAmt = inv.netAmount ?? 0;
    const vatAmt = inv.vatAmount ?? 0;
    const estimatedWithholding = netAmt > 0 ? Math.max(0, inv.totalAmount - vatAmt - netAmt) : 0;

    if (estimatedWithholding > 0.01) {
      const base = inv.totalAmount - vatAmt;
      rentBase += base;
      rentWithholding += estimatedWithholding;
      if (inv.contact?.cif) recipients.add(inv.contact.cif);
    }
  }

  return {
    period: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    rents: {
      recipients: recipients.size,
      base: r2(rentBase),
      withholding: r2(rentWithholding),
    },
    checks,
  };
}

// ---------------------------------------------------------------------------
// Model 390 — Annual VAT summary
// ---------------------------------------------------------------------------

export interface Model390 {
  year: number;
  quarters: Array<{
    quarter: number;
    devengado: number;
    deducible: number;
    resultado: number;
  }>;
  annualTotals: {
    devengado: number;
    deducible: number;
    resultado: number;
  };
}

export async function calculateModel390(
  db: ScopedPrisma,
  companyId: string,
  year: number
): Promise<Model390> {
  const quarters: Model390["quarters"] = [];
  let totalDev = 0;
  let totalDed = 0;

  for (let q = 1; q <= 4; q++) {
    const from = new Date(year, (q - 1) * 3, 1);
    const to = new Date(year, q * 3, 0, 23, 59, 59, 999);
    const m303 = await calculateModel303(db, companyId, from, to);
    quarters.push({
      quarter: q,
      devengado: m303.devengado.total,
      deducible: m303.deducible.total,
      resultado: m303.resultado,
    });
    totalDev += m303.devengado.total;
    totalDed += m303.deducible.total;
  }

  return {
    year,
    quarters,
    annualTotals: {
      devengado: r2(totalDev),
      deducible: r2(totalDed),
      resultado: r2(totalDev - totalDed),
    },
  };
}

// ---------------------------------------------------------------------------
// Fiscal Calendar
// ---------------------------------------------------------------------------

export interface FiscalDeadline {
  model: string;
  quarter?: number;
  description: string;
  dueDate: string;
}

export function getFiscalCalendar(year: number): FiscalDeadline[] {
  const deadlines: FiscalDeadline[] = [];

  // Quarterly models: 303, 111, 115
  const quarterDates: Array<{ q: number; month: number; day: number; year: number }> = [
    { q: 1, month: 4, day: 20, year },
    { q: 2, month: 7, day: 20, year },
    { q: 3, month: 10, day: 20, year },
    { q: 4, month: 1, day: 30, year: year + 1 },
  ];

  for (const qd of quarterDates) {
    const due = `${qd.year}-${String(qd.month).padStart(2, "0")}-${String(qd.day).padStart(2, "0")}`;

    deadlines.push({
      model: "303",
      quarter: qd.q,
      description: `Modelo 303 — IVA trimestral (T${qd.q})`,
      dueDate: due,
    });

    deadlines.push({
      model: "111",
      quarter: qd.q,
      description: `Modelo 111 — Retenciones trabajo/profesionales (T${qd.q})`,
      dueDate: due,
    });

    deadlines.push({
      model: "115",
      quarter: qd.q,
      description: `Modelo 115 — Retenciones alquileres (T${qd.q})`,
      dueDate: due,
    });
  }

  // Impuesto de Sociedades: Jul 25
  deadlines.push({
    model: "IS",
    description: `Impuesto de Sociedades — Ejercicio ${year - 1}`,
    dueDate: `${year}-07-25`,
  });

  // Model 390: Annual VAT summary — Jan 30 of next year
  deadlines.push({
    model: "390",
    description: `Modelo 390 — Resumen anual IVA ${year}`,
    dueDate: `${year + 1}-01-30`,
  });

  return deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ---------------------------------------------------------------------------
// Model IS — Impuesto sobre Sociedades
// ---------------------------------------------------------------------------

export interface ModelIS {
  year: number;
  baseImponible: number;
  ajustes: { gastosNoDeducibles: number; ingresosExentos: number };
  baseImponibleAjustada: number;
  tipoImpositivo: number;
  cuotaIntegra: number;
  deducciones: number;
  cuotaLiquida: number;
  retencionesYPagosACuenta: number;
  cuotaDiferencial: number;
}

export async function calculateModelIS(
  db: ScopedPrisma,
  companyId: string,
  year: number
): Promise<ModelIS> {
  // 1. Get PyG resultado antes de impuestos for the full year
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31);
  const pyg = await generatePyG(db, from, to, "titles", false);
  const baseImponible = pyg.results.resultadoAntesImpuestos;

  // 2. Read persisted adjustments (or default to 0)
  const adj = await (db as any).fiscalAdjustment.findFirst({
    where: { year },
  });
  const ajustes = {
    gastosNoDeducibles: adj?.gastosNoDeducibles ?? 0,
    ingresosExentos: adj?.ingresosExentos ?? 0,
  };
  const baseAjustada = baseImponible + ajustes.gastosNoDeducibles - ajustes.ingresosExentos;

  // 3. Tax rate: 25% general (Spain). Could be 23% for small companies.
  const tipoImpositivo = 0.25;
  const cuotaIntegra = baseAjustada > 0 ? r2(baseAjustada * tipoImpositivo) : 0;

  // 4. Deductions: 0 for now
  const deducciones = 0;
  const cuotaLiquida = Math.max(0, cuotaIntegra - deducciones);

  // 5. Withholdings: sum of account 473 balance
  // Account 473 = "HP retenciones y pagos a cuenta" (asset, debit balance = amount to offset)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retAccount = await (db as any).account.findFirst({
    where: { code: "473" },
    select: { id: true },
  });
  let retenciones = 0;
  if (retAccount) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jeLines = await (db as any).journalEntryLine.findMany({
      where: { accountId: retAccount.id },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    retenciones = jeLines.reduce((s: number, l: any) => s + (l.debit - l.credit), 0);
  }

  const cuotaDiferencial = r2(cuotaLiquida - retenciones);

  return {
    year,
    baseImponible: r2(baseImponible),
    ajustes,
    baseImponibleAjustada: r2(baseAjustada),
    tipoImpositivo,
    cuotaIntegra,
    deducciones,
    cuotaLiquida,
    retencionesYPagosACuenta: r2(retenciones),
    cuotaDiferencial,
  };
}
