/**
 * Investment & CAPEX Detector.
 *
 * Runs BEFORE the LLM cascade to identify bank transactions that are
 * likely CAPEX (fixed asset purchases) or financial investments
 * (equity acquisitions, loans granted, dividends received).
 *
 * Uses deterministic signals only (keywords, amount thresholds, counterparty history).
 * If detected → scenario 19 (CAPEX) or 20 (INVESTMENT) with confidence 0.0
 * → ALWAYS goes to bandeja for controller decision. NEVER auto-approves.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction, EconomicCategory } from "@prisma/client";

type DocumentType =
  | "INVOICE_SUPPLIER"
  | "DEED_OF_ACQUISITION"
  | "SHARE_PURCHASE_AGREEMENT"
  | "LOAN_AGREEMENT"
  | "CAPITAL_CALL_NOTICE"
  | "DIVIDEND_CERTIFICATE"
  | "FUND_STATEMENT";

export interface RequiredDocument {
  type: DocumentType;
  description: string;
}

export interface InvestmentDetectionResult {
  isCapexOrInvestment: boolean;
  suggestedCategory: EconomicCategory | null;
  suggestedPgcAccount: string | null;
  requiredDocuments: RequiredDocument[];
  confidenceSignals: string[];
}

const CAPEX_KEYWORDS = [
  "maquinaria",
  "equipo",
  "instalacion",
  "obra",
  "reforma",
  "vehiculo",
  "mobiliario",
  "informatica",
  "licencia perpetua",
  "inmovilizado",
  "activo fijo",
  "leasing",
];

const INVESTMENT_KEYWORDS = [
  "participacion",
  "adquisicion",
  "compraventa acciones",
  "ampliacion capital",
  "suscripcion",
  "aportacion capital",
  "dividendo",
  "reparto beneficios",
  "llamada capital",
  "capital call",
  "prestamo concedido",
  "credito concedido",
];

const LOAN_RETURN_KEYWORDS = [
  "devolucion prestamo",
  "amortizacion prestamo concedido",
  "cobro principal",
  "reembolso",
];

export async function detectInvestmentOrCapex(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<InvestmentDetectionResult> {
  const empty: InvestmentDetectionResult = {
    isCapexOrInvestment: false,
    suggestedCategory: null,
    suggestedPgcAccount: null,
    requiredDocuments: [],
    confidenceSignals: [],
  };

  const amount = Math.abs(tx.amount);
  const concept = (tx.concept ?? "").toLowerCase();
  const signals: string[] = [];

  const hasCapexConcept = CAPEX_KEYWORDS.some((k) => concept.includes(k));
  const hasInvestmentConcept = INVESTMENT_KEYWORDS.some((k) => concept.includes(k));
  const hasLoanReturnConcept = LOAN_RETURN_KEYWORDS.some((k) => concept.includes(k));
  const isLargeAmount = amount >= 50_000;

  if (hasCapexConcept) signals.push("concepto_capex");
  if (hasInvestmentConcept) signals.push("concepto_inversion");
  if (hasLoanReturnConcept) signals.push("concepto_cobro_prestamo");

  // Check operational history with this counterparty
  let hasOperationalHistory = false;
  if (tx.counterpartName) {
    const count = await db.bankTransaction.count({
      where: {
        counterpartName: { contains: tx.counterpartName.substring(0, 15), mode: "insensitive" },
        id: { not: tx.id },
        status: { in: ["RECONCILED", "CLASSIFIED"] },
      },
    });
    hasOperationalHistory = count > 3;
  }

  if (isLargeAmount && !hasOperationalHistory) {
    signals.push("importe_alto_sin_historial_operativo");
  }

  // Check if there's an existing Investment linked to this counterparty
  const linkedInvestment = tx.counterpartName
    ? await db.investment.findFirst({
        where: {
          name: { contains: tx.counterpartName.substring(0, 15), mode: "insensitive" },
          status: "ACTIVE",
        },
      })
    : null;

  if (linkedInvestment) signals.push("investment_existente");

  // ── Decision rules ──

  // Dividend received
  if (tx.amount > 0 && (concept.includes("dividendo") || concept.includes("reparto"))) {
    return {
      isCapexOrInvestment: true,
      suggestedCategory: "INVESTMENT_RETURN",
      suggestedPgcAccount: "760",
      requiredDocuments: [
        { type: "DIVIDEND_CERTIFICATE", description: "Certificado de distribución de dividendos" },
      ],
      confidenceSignals: ["dividendo_cobrado"],
    };
  }

  // Loan granted
  if (tx.amount < 0 && hasInvestmentConcept && concept.includes("prestamo")) {
    return {
      isCapexOrInvestment: true,
      suggestedCategory: "LOAN_GRANTED",
      suggestedPgcAccount: "252",
      requiredDocuments: [{ type: "LOAN_AGREEMENT", description: "Contrato de préstamo firmado" }],
      confidenceSignals: ["prestamo_concedido"],
    };
  }

  // Loan repayment received
  if (tx.amount > 0 && hasLoanReturnConcept) {
    return {
      isCapexOrInvestment: true,
      suggestedCategory: "LOAN_REPAYMENT_RECEIVED",
      suggestedPgcAccount: "252",
      requiredDocuments: [],
      confidenceSignals: ["cobro_prestamo_concedido"],
    };
  }

  // Investment acquisition
  if (tx.amount < 0 && (hasInvestmentConcept || (isLargeAmount && linkedInvestment))) {
    return {
      isCapexOrInvestment: true,
      suggestedCategory: "INVESTMENT_ACQUISITION",
      suggestedPgcAccount: amount >= 100_000 ? "240" : "250",
      requiredDocuments: [
        {
          type: "SHARE_PURCHASE_AGREEMENT",
          description: "Contrato de compraventa, ampliación de capital o préstamo",
        },
      ],
      confidenceSignals: signals,
    };
  }

  // CAPEX
  if (
    tx.amount < 0 &&
    (hasCapexConcept || (isLargeAmount && !hasOperationalHistory && !hasInvestmentConcept))
  ) {
    return {
      isCapexOrInvestment: true,
      suggestedCategory: "CAPEX_ACQUISITION",
      suggestedPgcAccount: inferCapexPgcAccount(concept),
      requiredDocuments: [
        { type: "INVOICE_SUPPLIER", description: "Factura del proveedor del activo fijo" },
      ],
      confidenceSignals: signals,
    };
  }

  return empty;
}

function inferCapexPgcAccount(concept: string): string {
  if (concept.includes("terreno") || concept.includes("solar")) return "210";
  if (concept.includes("construccion") || concept.includes("obra") || concept.includes("reforma"))
    return "211";
  if (concept.includes("maquinaria") || concept.includes("equipo")) return "213";
  if (concept.includes("vehiculo") || concept.includes("coche") || concept.includes("furgoneta"))
    return "218";
  if (
    concept.includes("informatica") ||
    concept.includes("servidor") ||
    concept.includes("hardware")
  )
    return "217";
  if (concept.includes("mobiliario")) return "216";
  if (concept.includes("instalacion")) return "215";
  if (concept.includes("licencia") || concept.includes("software")) return "206";
  if (concept.includes("leasing")) return "214";
  return "219";
}
