import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

/**
 * POST /api/settings/rules/parse
 *
 * Takes a natural language rule description and returns a structured rule proposal.
 * Also enriches with historical data from the company's transactions.
 *
 * Body: { text: string }
 * Returns: { proposal: StructuredRule, assumptions: string[], suggestions: string[] }
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const { company } = ctx;
  const body = await req.json();
  const text = body.text as string;

  if (!text || text.length < 5) {
    return NextResponse.json({ error: "Describe la regla que quieres crear." }, { status: 400 });
  }

  // ── Load context for enrichment ──
  const [contacts, accounts, recentTx] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId: company.id },
      select: { id: true, name: true, cif: true, iban: true, type: true },
    }),
    prisma.account.findMany({
      where: { companyId: company.id, isActive: true },
      select: { code: true, name: true, group: true },
    }),
    prisma.bankTransaction.findMany({
      where: { companyId: company.id },
      orderBy: { valueDate: "desc" },
      take: 200,
      select: {
        concept: true,
        amount: true,
        counterpartName: true,
        counterpartIban: true,
        valueDate: true,
      },
    }),
  ]);

  // Build context strings
  const contactList = contacts
    .map((c) => `${c.name}${c.cif ? ` (${c.cif})` : ""}${c.iban ? ` IBAN:${c.iban}` : ""}`)
    .join("\n");

  const accountList = accounts
    .slice(0, 50)
    .map((a) => `${a.code} - ${a.name}`)
    .join("\n");

  // ── Call Claude to parse ──
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Eres un asistente de contabilidad español. El controller ha escrito esta regla en lenguaje natural:

"${text}"

Contexto de la empresa:
- Contactos conocidos:
${contactList || "Ninguno"}

- Cuentas PGC disponibles:
${accountList || "Ninguna"}

Transforma la regla en formato estructurado JSON. Responde SOLO con JSON válido:

{
  "type": "EXACT_AMOUNT_CONTACT" | "CONCEPT_CLASSIFY" | "IBAN_CLASSIFY" | "IBAN_INTERNAL" | "FINANCIAL_SPLIT",
  "conditions": {
    "counterpartName": "nombre exacto del contacto si aplica" | null,
    "counterpartCif": "CIF si lo encontraste" | null,
    "counterpartIban": "IBAN si lo encontraste" | null,
    "conceptPattern": "patrón regex o substring para el concepto bancario" | null,
    "minAmount": number | null,
    "maxAmount": number | null,
    "transactionType": "cobro" | "pago" | "ambos" | null,
    "differencePercent": { "min": number, "max": number } | null
  },
  "action": "auto_approve" | "classify" | "escalate" | "adjust_difference",
  "actionDetails": {
    "accountCode": "código PGC si es clasificación" | null,
    "accountName": "nombre de la cuenta" | null,
    "cashflowType": "OPERATING" | "INVESTING" | "FINANCING" | null,
    "differenceReason": "BANK_COMMISSION" | "EARLY_PAYMENT" | "COMMERCIAL_DISCOUNT" | "PARTIAL_PAYMENT" | "OTHER" | null,
    "description": "descripción breve de la regla"
  },
  "humanReadable": "Resumen en español de la regla interpretada",
  "assumptions": ["lista de cosas que he asumido o que podrían ser ambiguas"],
  "suggestions": ["sugerencias para mejorar la regla basadas en el contexto"]
}

Si el contacto mencionado es ambiguo (varios posibles), pon en assumptions "Contrapartida ambigua: ¿X, Y o Z?" con los candidatos.
Si una condición está implícita, asúmela y ponla en assumptions.
Si la categoría PGC no existe exactamente, sugiere la más cercana.`,
      },
    ],
  });

  const responseText = response.content[0].type === "text" ? response.content[0].text : "";

  let proposal;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    proposal = JSON.parse(jsonMatch?.[0] ?? responseText);
  } catch {
    return NextResponse.json({
      error: "No pude interpretar la regla. Intenta reformularla.",
      raw: responseText.slice(0, 300),
    }, { status: 400 });
  }

  // ── Enrich with historical data ──
  const enrichment = await enrichWithHistory(
    proposal,
    recentTx,
    contacts,
    company.id
  );

  return NextResponse.json({
    proposal: { ...proposal, ...enrichment.overrides },
    assumptions: [...(proposal.assumptions ?? []), ...enrichment.assumptions],
    suggestions: [...(proposal.suggestions ?? []), ...enrichment.suggestions],
  });
}, "manage:rules");

// ── Historical enrichment ──

async function enrichWithHistory(
  proposal: Record<string, unknown>,
  recentTx: { concept: string | null; amount: number; counterpartName: string | null; counterpartIban: string | null; valueDate: Date }[],
  contacts: { id: string; name: string; cif: string | null; iban: string | null }[],
  companyId: string
): Promise<{ overrides: Record<string, unknown>; assumptions: string[]; suggestions: string[] }> {
  const assumptions: string[] = [];
  const suggestions: string[] = [];
  const overrides: Record<string, unknown> = {};

  const conditions = proposal.conditions as Record<string, unknown> | undefined;
  if (!conditions) return { overrides, assumptions, suggestions };

  const counterpartName = conditions.counterpartName as string | null;

  if (counterpartName) {
    // Find matching transactions
    const matchingTx = recentTx.filter((tx) =>
      tx.counterpartName?.toLowerCase().includes(counterpartName.toLowerCase()) ||
      tx.concept?.toLowerCase().includes(counterpartName.toLowerCase())
    );

    if (matchingTx.length > 0) {
      // Calculate typical amount range
      const amounts = matchingTx.map((tx) => Math.abs(tx.amount));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const minHistorical = Math.min(...amounts);
      const maxHistorical = Math.max(...amounts);

      // If controller specified a range, compare with historical
      if (conditions.minAmount || conditions.maxAmount) {
        const userMin = conditions.minAmount as number | null;
        const userMax = conditions.maxAmount as number | null;
        if (userMin && userMin < minHistorical * 0.8) {
          suggestions.push(`El rango mínimo que has puesto (${userMin}€) es más bajo que el histórico (${minHistorical.toFixed(0)}€). ¿Quieres ajustarlo?`);
        }
        if (userMax && userMax > maxHistorical * 1.2) {
          suggestions.push(`El rango máximo (${userMax}€) es más alto que el histórico (${maxHistorical.toFixed(0)}€). ¿Quieres ajustarlo?`);
        }
      } else {
        suggestions.push(`Rango histórico de importes: ${minHistorical.toFixed(0)}€ - ${maxHistorical.toFixed(0)}€ (media: ${avgAmount.toFixed(0)}€)`);
      }

      // Check for difference patterns
      if (conditions.differencePercent) {
        // Already specified
      } else {
        // Look for consistent differences in matched transactions
        const diffs = matchingTx
          .filter((tx) => tx.amount > 0) // cobros
          .map((tx) => tx.amount)
          .sort((a, b) => a - b);

        if (diffs.length >= 3) {
          // Check if amounts cluster around a value with consistent offset
          const median = diffs[Math.floor(diffs.length / 2)];
          const variations = diffs.map((d) => ((d - median) / median) * 100);
          const avgVariation = variations.reduce((s, v) => s + v, 0) / variations.length;
          if (Math.abs(avgVariation) > 0.5 && Math.abs(avgVariation) < 5) {
            suggestions.push(`Detectado patrón de diferencia consistente: ~${avgVariation.toFixed(1)}% en cobros de ${counterpartName}`);
          }
        }
      }

      // Auto-fill IBAN if unique
      const ibans = new Set(matchingTx.map((tx) => tx.counterpartIban).filter(Boolean));
      if (ibans.size === 1 && !conditions.counterpartIban) {
        const iban = [...ibans][0]!;
        overrides.conditions = { ...conditions, counterpartIban: iban };
        assumptions.push(`IBAN vinculado automáticamente: ${iban.slice(0, 8)}...${iban.slice(-4)}`);
      }
    }

    // Check for ambiguous contacts
    const matching = contacts.filter((c) =>
      c.name.toLowerCase().includes(counterpartName.toLowerCase())
    );
    if (matching.length > 1) {
      assumptions.push(
        `Contrapartida ambigua: ${matching.map((c) => `${c.name}${c.cif ? ` (${c.cif})` : ""}`).join(", ")}. Selecciona la correcta.`
      );
    }
  }

  return { overrides, assumptions, suggestions };
}
