/**
 * Uses Claude LLM to interpret cryptic bank transaction concepts.
 * Now routes through the model router (Haiku for simple NLP).
 */

import { callAIJson } from "@/lib/ai/model-router";
import { PARSE_CONCEPT } from "@/lib/ai/prompt-registry";

export interface ParsedBankConcept {
  interpreted: string;
  possibleContact: string | null;
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
  confidence: number;
}

export async function parseBankConcept(
  concept: string,
  amount: number,
  iban: string | null
): Promise<ParsedBankConcept> {
  if (!concept || concept.trim().length === 0) {
    return { interpreted: "Empty concept", possibleContact: null, possibleType: "other", confidence: 0 };
  }

  try {
    const parsed = await callAIJson(
      "parse_concept",
      PARSE_CONCEPT.system,
      PARSE_CONCEPT.buildUser({ concept, amount, iban }),
      PARSE_CONCEPT.schema
    );

    if (!parsed) return fallbackParse(concept, amount);

    return mapToResult(parsed, concept);
  } catch (err) {
    console.error(`[parseBankConcept] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return fallbackParse(concept, amount);
  }
}

function mapToResult(
  parsed: { counterpartName: string | null; category: string | null; paymentMethod: string | null; reference: string | null; keywords: string[] },
  originalConcept: string
): ParsedBankConcept {
  const parts: string[] = [];
  if (parsed.category) parts.push(categoryLabel(parsed.category));
  if (parsed.counterpartName) parts.push(`de/a ${parsed.counterpartName}`);
  if (parsed.paymentMethod) parts.push(`(${parsed.paymentMethod})`);
  if (parsed.reference) parts.push(`ref: ${parsed.reference}`);

  return {
    interpreted: parts.length > 0 ? parts.join(" ") : `Transaccion: ${originalConcept}`,
    possibleContact: parsed.counterpartName,
    possibleType: mapCategory(parsed.category),
    confidence: estimateConfidence(parsed),
  };
}

function mapCategory(category: string | null): ParsedBankConcept["possibleType"] {
  switch (category) {
    case "payroll": return "payroll";
    case "taxes": return "tax";
    case "insurance": case "utilities": case "rent": return "expense";
    case "supplier_payment": case "client_collection": return "invoice_payment";
    case "financial": return "bank_fee";
    case "internal_transfer": return "internal_transfer";
    default: return "other";
  }
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    payroll: "Nomina", rent: "Alquiler", utilities: "Suministros",
    insurance: "Seguro", taxes: "Impuestos", supplier_payment: "Pago a proveedor",
    client_collection: "Cobro de cliente", financial: "Operacion financiera",
    internal_transfer: "Transferencia interna",
  };
  return labels[category] ?? category;
}

function estimateConfidence(parsed: { counterpartName: string | null; category: string | null; paymentMethod: string | null; reference: string | null; keywords: string[] }): number {
  let score = 0.3;
  if (parsed.counterpartName) score += 0.25;
  if (parsed.category) score += 0.2;
  if (parsed.paymentMethod) score += 0.1;
  if (parsed.reference) score += 0.1;
  if (parsed.keywords.length > 0) score += 0.05;
  return Math.min(1, score);
}

function fallbackParse(concept: string, amount: number): ParsedBankConcept {
  const lower = concept.toLowerCase();

  if (/nomin[ae]|salario|sueldo/.test(lower))
    return { interpreted: "Pago de nomina", possibleContact: null, possibleType: "payroll", confidence: 0.6 };
  if (/comisi[oó]n|com\s|com\./.test(lower))
    return { interpreted: "Comision bancaria", possibleContact: null, possibleType: "bank_fee", confidence: 0.7 };
  if (/aeat|agencia\s*tributaria|modelo\s*\d{3}/.test(lower))
    return { interpreted: "Pago de impuestos (AEAT)", possibleContact: "Agencia Tributaria", possibleType: "tax", confidence: 0.75 };
  if (/seg\s*social|s\.?\s?s\.?\s|tesoreria\s*general/.test(lower))
    return { interpreted: "Seguridad Social", possibleContact: "Tesoreria General de la Seguridad Social", possibleType: "social_security", confidence: 0.75 };
  if (/transf|transfer/.test(lower))
    return { interpreted: `Transferencia: ${concept}`, possibleContact: null, possibleType: amount > 0 ? "invoice_payment" : "expense", confidence: 0.3 };

  return { interpreted: concept, possibleContact: null, possibleType: "other", confidence: 0.1 };
}
