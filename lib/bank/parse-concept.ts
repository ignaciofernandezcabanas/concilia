/**
 * Uses Claude LLM to interpret cryptic bank transaction concepts.
 *
 * Spanish bank statements often contain truncated names, codes, and
 * abbreviations that are difficult for users to understand. This module
 * calls Claude to produce a human-readable interpretation.
 */

import { anthropic } from "@/lib/ai/client";
import {
  conceptParsingPrompt,
  parseConceptResponse,
  type ParsedConcept,
} from "@/lib/ai/prompts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedBankConcept {
  /** Human-readable interpretation of the bank concept. */
  interpreted: string;
  /** Likely counterpart name, if identifiable. */
  possibleContact: string | null;
  /** Likely transaction type. */
  possibleType:
    | "invoice_payment"
    | "expense"
    | "payroll"
    | "tax"
    | "social_security"
    | "bank_fee"
    | "internal_transfer"
    | "loan"
    | "other";
  /** Confidence score between 0 and 1. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Call Claude to interpret a raw bank concept string.
 *
 * @param concept - The raw concept text from the bank statement.
 * @param amount  - The transaction amount (sign indicates direction).
 * @param iban    - The counterpart IBAN, if available.
 * @returns Structured interpretation with confidence score.
 */
export async function parseBankConcept(
  concept: string,
  amount: number,
  iban: string | null,
): Promise<ParsedBankConcept> {
  if (!concept || concept.trim().length === 0) {
    return {
      interpreted: "Empty concept",
      possibleContact: null,
      possibleType: "other",
      confidence: 0,
    };
  }

  try {
    const prompt = conceptParsingPrompt(concept, amount, iban);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const parsed = parseConceptResponse(text);

    if (!parsed) {
      console.warn(
        `[parseBankConcept] Failed to parse LLM response for concept: "${concept}"`,
      );
      return fallbackParse(concept, amount);
    }

    return mapToResult(parsed, concept);
  } catch (err) {
    console.error(
      `[parseBankConcept] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallbackParse(concept, amount);
  }
}

// ---------------------------------------------------------------------------
// Mapping from existing ParsedConcept to our return type
// ---------------------------------------------------------------------------

function mapToResult(
  parsed: ParsedConcept,
  originalConcept: string,
): ParsedBankConcept {
  // Build interpreted text from parsed fields
  const parts: string[] = [];
  if (parsed.category) parts.push(categoryLabel(parsed.category));
  if (parsed.counterpartName) parts.push(`de/a ${parsed.counterpartName}`);
  if (parsed.paymentMethod) parts.push(`(${parsed.paymentMethod})`);
  if (parsed.reference) parts.push(`ref: ${parsed.reference}`);

  const interpreted =
    parts.length > 0 ? parts.join(" ") : `Transaccion: ${originalConcept}`;

  return {
    interpreted,
    possibleContact: parsed.counterpartName,
    possibleType: mapCategory(parsed.category),
    confidence: estimateConfidence(parsed),
  };
}

function mapCategory(
  category: string | null,
): ParsedBankConcept["possibleType"] {
  switch (category) {
    case "payroll":
      return "payroll";
    case "taxes":
      return "tax";
    case "insurance":
    case "utilities":
    case "rent":
      return "expense";
    case "supplier_payment":
      return "invoice_payment";
    case "client_collection":
      return "invoice_payment";
    case "financial":
      return "bank_fee";
    case "internal_transfer":
      return "internal_transfer";
    default:
      return "other";
  }
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    payroll: "Nomina",
    rent: "Alquiler",
    utilities: "Suministros",
    insurance: "Seguro",
    taxes: "Impuestos",
    supplier_payment: "Pago a proveedor",
    client_collection: "Cobro de cliente",
    financial: "Operacion financiera",
    internal_transfer: "Transferencia interna",
  };
  return labels[category] ?? category;
}

function estimateConfidence(parsed: ParsedConcept): number {
  let score = 0.3; // base
  if (parsed.counterpartName) score += 0.25;
  if (parsed.category) score += 0.2;
  if (parsed.paymentMethod) score += 0.1;
  if (parsed.reference) score += 0.1;
  if (parsed.keywords.length > 0) score += 0.05;
  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Fallback: simple regex-based parsing when LLM is unavailable
// ---------------------------------------------------------------------------

function fallbackParse(concept: string, amount: number): ParsedBankConcept {
  const lower = concept.toLowerCase();

  if (/nomin[ae]|salario|sueldo/.test(lower)) {
    return {
      interpreted: "Pago de nomina",
      possibleContact: null,
      possibleType: "payroll",
      confidence: 0.6,
    };
  }

  if (/comisi[oó]n|com\s|com\./.test(lower)) {
    return {
      interpreted: "Comision bancaria",
      possibleContact: null,
      possibleType: "bank_fee",
      confidence: 0.7,
    };
  }

  if (/aeat|agencia\s*tributaria|modelo\s*\d{3}/.test(lower)) {
    return {
      interpreted: "Pago de impuestos (AEAT)",
      possibleContact: "Agencia Tributaria",
      possibleType: "tax",
      confidence: 0.75,
    };
  }

  if (/seg\s*social|s\.?\s?s\.?\s|tesoreria\s*general/.test(lower)) {
    return {
      interpreted: "Seguridad Social",
      possibleContact: "Tesoreria General de la Seguridad Social",
      possibleType: "social_security",
      confidence: 0.75,
    };
  }

  if (/transf|transfer/.test(lower)) {
    return {
      interpreted: `Transferencia: ${concept}`,
      possibleContact: null,
      possibleType: amount > 0 ? "invoice_payment" : "expense",
      confidence: 0.3,
    };
  }

  return {
    interpreted: concept,
    possibleContact: null,
    possibleType: "other",
    confidence: 0.1,
  };
}
