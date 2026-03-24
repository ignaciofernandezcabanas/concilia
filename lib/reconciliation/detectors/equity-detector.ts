/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BankTransaction } from "@prisma/client";
import type { ScopedPrisma } from "@/lib/db-scoped";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquityDetectionResult {
  detected: boolean;
  suggestedType: string;
  confidence: number;
  priority: "DECISION";
}

// ---------------------------------------------------------------------------
// Keyword heuristics
// ---------------------------------------------------------------------------

const EQUITY_PATTERNS: Array<{
  keywords: string[];
  type: string;
}> = [
  {
    keywords: ["dividendo", "reparto beneficio"],
    type: "ACTA_JUNTA",
  },
  {
    keywords: ["ampliacion capital", "ampliación capital", "desembolso capital"],
    type: "ESCRITURA",
  },
  {
    keywords: ["prestamo socio", "préstamo socio", "prestamo participativo"],
    type: "CONTRATO_PRESTAMO",
  },
  {
    keywords: ["subvencion", "subvención", "cdti", "enisa", "icex"],
    type: "RESOLUCION_SUBVENCION",
  },
  {
    keywords: [
      "aeat",
      "modelo 303",
      "modelo 111",
      "modelo 115",
      "modelo 200",
      "agencia tributaria",
    ],
    type: "MODELO_FISCAL",
  },
  {
    keywords: ["nomina", "nómina", "salario", "sueldo"],
    type: "RECIBO_NOMINA",
  },
];

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * Detects equity-related bank movements (dividends, capital changes,
 * partner loans, subsidies, tax payments, payroll) by concept heuristics.
 *
 * Returns confidence 0.0 and priority DECISION — these always require
 * controller input. If a SupportingDocument already exists, the engine
 * handles matching separately.
 */
export async function detectEquityMovement(
  tx: BankTransaction,
  _db: ScopedPrisma // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<EquityDetectionResult | null> {
  const concept = (tx.concept ?? "").toLowerCase();
  const conceptParsed = ((tx as any).conceptParsed ?? "").toLowerCase();
  const searchText = `${concept} ${conceptParsed}`;

  // Skip if already detected as payroll by the payroll detector
  if ((tx as any).detectedType === "PAYROLL") {
    return null;
  }

  for (const pattern of EQUITY_PATTERNS) {
    // Skip RECIBO_NOMINA if payroll detector should handle it
    if (pattern.type === "RECIBO_NOMINA" && (tx as any).detectedType === "PAYROLL") {
      continue;
    }

    const matched = pattern.keywords.some((kw) => searchText.includes(kw));
    if (matched) {
      return {
        detected: true,
        suggestedType: pattern.type,
        confidence: 0.0,
        priority: "DECISION",
      };
    }
  }

  return null;
}
