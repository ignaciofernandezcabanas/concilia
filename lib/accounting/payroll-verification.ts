/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Monthly Payroll Verification.
 *
 * Checks whether all expected payroll components (salary, SS company,
 * IRPF withholdings) have been detected for a given month.
 * Used by the daily agent to alert controllers about missing components.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PayrollVerificationResult {
  complete: boolean;
  missing: string[];
  totalPayroll: number;
  components: { type: string; amount: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALARY_KEYWORDS = ["NOMINA", "NÓMINA", "SALARIO", "PAGO EMPLEADOS"];
const SS_KEYWORDS = ["TGSS", "SEGURIDAD SOCIAL", "SS EMPRESA", "CUOTA EMPRESARIAL"];
const IRPF_KEYWORDS = ["MODELO 111", "IRPF"];

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function verifyMonthlyPayroll(
  db: ScopedPrisma,
  year: number,
  month: number
): Promise<PayrollVerificationResult> {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59);

  // Find all bank transactions in the month that could be payroll-related
  const transactions = await (db as any).bankTransaction.findMany({
    where: {
      valueDate: { gte: from, lte: to },
      amount: { lt: 0 }, // Payroll = outgoing payments
    },
    select: {
      amount: true,
      concept: true,
      detectedType: true,
    },
  });

  const components: { type: string; amount: number }[] = [];
  let hasSalary = false;
  let hasSS = false;
  let hasIRPF = false;

  for (const tx of transactions) {
    const concept = (tx.concept ?? "").toUpperCase();
    const isDetectedPayroll = tx.detectedType === "PAYROLL";

    if (isDetectedPayroll || matchesAny(concept, SALARY_KEYWORDS)) {
      if (matchesAny(concept, SS_KEYWORDS)) {
        hasSS = true;
        components.push({ type: "SS_COMPANY", amount: Math.abs(tx.amount) });
      } else if (matchesAny(concept, IRPF_KEYWORDS)) {
        hasIRPF = true;
        components.push({ type: "IRPF", amount: Math.abs(tx.amount) });
      } else {
        hasSalary = true;
        components.push({ type: "SALARY", amount: Math.abs(tx.amount) });
      }
    } else if (matchesAny(concept, SS_KEYWORDS)) {
      hasSS = true;
      components.push({ type: "SS_COMPANY", amount: Math.abs(tx.amount) });
    } else if (matchesAny(concept, IRPF_KEYWORDS)) {
      hasIRPF = true;
      components.push({ type: "IRPF", amount: Math.abs(tx.amount) });
    }
  }

  const missing: string[] = [];
  if (!hasSalary) missing.push("SALARY");
  if (!hasSS) missing.push("SS_COMPANY");
  if (!hasIRPF) missing.push("IRPF");

  const totalPayroll = components.reduce((sum, c) => sum + c.amount, 0);

  return {
    complete: missing.length === 0,
    missing,
    totalPayroll: Math.round(totalPayroll * 100) / 100,
    components,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}
