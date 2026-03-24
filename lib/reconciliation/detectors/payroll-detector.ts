/**
 * Payroll Detector.
 *
 * Identifies bank transactions related to payroll:
 * - SALARY: employee salary payments (PGC 640)
 * - SS_COMPANY: company Social Security contributions (PGC 642)
 * - SS_EMPLOYEE: employee SS deductions withheld (PGC 476)
 * - IRPF: income tax withholdings (PGC 4751)
 *
 * Uses deterministic signals (concept keywords, counterparty IBAN, date range).
 * Does NOT skip subsequent phases — payroll transactions continue through
 * matchers and classifiers for full reconciliation.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ScopedPrisma } from "@/lib/db-scoped";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayrollType = "SALARY" | "SS_COMPANY" | "SS_EMPLOYEE" | "IRPF";

export interface PayrollDetectionResult {
  isPayroll: boolean;
  payrollType: PayrollType | null;
  confidence: number;
  suggestedAccountCode: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALARY_KEYWORDS = ["NOMINA", "NÓMINA", "SALARIO", "PAGO EMPLEADOS"];
const SS_COMPANY_KEYWORDS = ["TGSS", "SEGURIDAD SOCIAL", "SS EMPRESA", "CUOTA EMPRESARIAL"];
const SS_EMPLOYEE_KEYWORDS = ["SS TRABAJADOR", "SS EMPLEADO"];
const IRPF_KEYWORDS = ["MODELO 111", "IRPF", "RETENCION TRABAJO", "RETENCIÓN TRABAJO"];

/** Known TGSS (Tesorería General de la Seguridad Social) IBAN prefixes */
const TGSS_IBAN_PREFIXES = ["ES2800492", "ES280049"];

const ACCOUNT_MAP: Record<PayrollType, string> = {
  SALARY: "640",
  SS_COMPANY: "642",
  SS_EMPLOYEE: "476",
  IRPF: "4751",
};

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export async function detectPayroll(
  tx: {
    amount: number;
    concept: string | null;
    counterpartyName: string | null;
    counterpartyIban: string | null;
    valueDate: Date;
  },
  _db: ScopedPrisma
): Promise<PayrollDetectionResult> {
  // Payroll must be a payment (negative amount)
  if (tx.amount >= 0) {
    return { isPayroll: false, payrollType: null, confidence: 0, suggestedAccountCode: null };
  }

  const concept = (tx.concept ?? "").toUpperCase();
  const counterpartyName = (tx.counterpartyName ?? "").toUpperCase();
  const iban = (tx.counterpartyIban ?? "").replace(/\s/g, "");

  let payrollType: PayrollType | null = null;
  let confidence = 0;

  // Check concept keywords in priority order (most specific first)
  if (matchesAny(concept, IRPF_KEYWORDS) || matchesAny(counterpartyName, IRPF_KEYWORDS)) {
    payrollType = "IRPF";
    confidence = 0.85;
  } else if (
    matchesAny(concept, SS_EMPLOYEE_KEYWORDS) ||
    matchesAny(counterpartyName, SS_EMPLOYEE_KEYWORDS)
  ) {
    payrollType = "SS_EMPLOYEE";
    confidence = 0.85;
  } else if (
    matchesAny(concept, SS_COMPANY_KEYWORDS) ||
    matchesAny(counterpartyName, SS_COMPANY_KEYWORDS)
  ) {
    payrollType = "SS_COMPANY";
    confidence = 0.85;
  } else if (
    matchesAny(concept, SALARY_KEYWORDS) ||
    matchesAny(counterpartyName, SALARY_KEYWORDS)
  ) {
    payrollType = "SALARY";
    confidence = 0.85;
  }

  // IBAN-based detection for TGSS
  if (!payrollType && iban) {
    for (const prefix of TGSS_IBAN_PREFIXES) {
      if (iban.startsWith(prefix)) {
        payrollType = "SS_COMPANY";
        confidence = 0.8;
        break;
      }
    }
  }

  if (!payrollType) {
    return { isPayroll: false, payrollType: null, confidence: 0, suggestedAccountCode: null };
  }

  // Date-based confidence boost: payroll typically happens between 25th and 5th
  const day = tx.valueDate.getDate();
  if (day >= 25 || day <= 5) {
    confidence = Math.min(confidence + 0.1, 0.99);
  }

  return {
    isPayroll: true,
    payrollType,
    confidence,
    suggestedAccountCode: ACCOUNT_MAP[payrollType],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}
