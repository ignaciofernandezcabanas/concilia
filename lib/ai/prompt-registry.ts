/**
 * Centralized prompt registry.
 *
 * RULE: User financial data (bank concepts, invoices, amounts) ALWAYS goes
 * inside XML tags in the user prompt to prevent prompt injection.
 */

import { z } from "zod";

// ════════════════════════════════════════════════════════════
// PARSE CONCEPT (Haiku)
// ════════════════════════════════════════════════════════════

export const PARSE_CONCEPT = {
  task: "parse_concept" as const,
  version: "1.0",
  system:
    `You are a financial analyst specializing in Spanish banking. ` +
    `Extract structured information from bank transaction concepts. ` +
    `Respond with ONLY valid JSON, no markdown.`,
  buildUser: (data: { concept: string; amount: number; iban: string | null }) =>
    `Analyze this bank transaction concept and extract structured information.\n\n` +
    `<bank_transaction>\n` +
    `Concept: ${data.concept}\n` +
    `Amount: ${data.amount} EUR\n` +
    `Counterpart IBAN: ${data.iban ?? "Unknown"}\n` +
    `</bank_transaction>\n\n` +
    `Return JSON with: counterpartName (string|null), paymentMethod ("transfer"|"direct_debit"|"card"|"check"|"receipt"|"other"|null), ` +
    `reference (string|null), isRecurring (boolean), category ("payroll"|"rent"|"utilities"|"insurance"|"taxes"|` +
    `"supplier_payment"|"client_collection"|"financial"|"internal_transfer"|null), keywords (string[], max 5).`,
  schema: z.object({
    counterpartName: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    reference: z.string().nullable(),
    isRecurring: z.boolean(),
    category: z.string().nullable(),
    keywords: z.array(z.string()).max(5).default([]),
  }),
};

// ════════════════════════════════════════════════════════════
// EXTRACT INVOICE PDF (Haiku)
// ════════════════════════════════════════════════════════════

export const EXTRACT_INVOICE_PDF = {
  task: "extract_invoice_pdf" as const,
  version: "1.0",
  system:
    `You are a Spanish invoice data extractor. Extract structured data from invoices. ` +
    `Respond with ONLY valid JSON, no markdown.`,
  buildUser: (data: { filename: string }) =>
    `Analiza esta factura y extrae los datos estructurados.\n\n` +
    `<invoice_document>\n` +
    `Filename: ${data.filename}\n` +
    `</invoice_document>\n\n` +
    `Return JSON: { number, issueDate (YYYY-MM-DD), dueDate (YYYY-MM-DD|null), totalAmount, netAmount, vatAmount, ` +
    `vatRate (decimal: 0.21), currency, description, supplierName, supplierCif, ` +
    `type ("RECEIVED"|"ISSUED"), confidence (0-1), ` +
    `lines: [{ description, quantity, unitPrice, total, vatRate }] }`,
  schema: z.object({
    number: z.string().nullable(),
    issueDate: z.string().nullable(),
    dueDate: z.string().nullable(),
    totalAmount: z.number().nullable(),
    netAmount: z.number().nullable(),
    vatAmount: z.number().nullable(),
    vatRate: z.number().nullable(),
    currency: z.string().default("EUR"),
    description: z.string().nullable(),
    supplierName: z.string().nullable(),
    supplierCif: z.string().nullable(),
    type: z.enum(["ISSUED", "RECEIVED"]).default("RECEIVED"),
    confidence: z.number().min(0).max(1).default(0.5),
    lines: z.array(z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      total: z.number(),
      vatRate: z.number(),
    })).default([]),
  }),
};

// ════════════════════════════════════════════════════════════
// EXPLAIN BANDEJA (Haiku)
// ════════════════════════════════════════════════════════════

export const EXPLAIN_BANDEJA = {
  task: "explain_bandeja" as const,
  version: "1.0",
  system:
    `Eres un asistente financiero. Explica en 2-3 frases en español por qué un movimiento bancario necesita revisión humana.\n` +
    `Sé directo y conciso. Sin introducciones ni cortesía.\n` +
    `Usa lenguaje de negocio, no técnico. Di "cobro" no "transacción positiva".\n` +
    `Si hay una acción recomendada, sugiérela.`,
  buildUser: (data: {
    txType: string; amount: string; date: string; concept: string;
    counterpart: string; matchType: string; confidence: string;
    threshold: string; matchReason: string;
    invoice?: { number: string; contact: string; amount: string; dueDate?: string; difference?: string; differenceReason?: string };
    materialityNote?: string;
  }) => {
    let prompt =
      `<bank_transaction>\n` +
      `Tipo: ${data.txType}\n` +
      `Importe: ${data.amount} EUR\n` +
      `Fecha: ${data.date}\n` +
      `Concepto: ${data.concept}\n` +
      `Contrapartida: ${data.counterpart}\n` +
      `</bank_transaction>\n\n` +
      `<system_proposal>\n` +
      `Tipo de match: ${data.matchType}\n` +
      `Confianza: ${data.confidence} (umbral: ${data.threshold})\n` +
      `Razón: ${data.matchReason}\n`;

    if (data.invoice) {
      prompt += `Factura candidata: #${data.invoice.number} de ${data.invoice.contact} por ${data.invoice.amount} EUR\n`;
      if (data.invoice.difference) {
        prompt += `Diferencia: ${data.invoice.difference} EUR (${data.invoice.differenceReason ?? "sin causa identificada"})\n`;
      }
      if (data.invoice.dueDate) {
        prompt += `Vencimiento: ${data.invoice.dueDate}\n`;
      }
    }
    prompt += `</system_proposal>\n`;

    if (data.materialityNote) {
      prompt += `\nNOTA: ${data.materialityNote}\n`;
    }

    prompt += `\nExplica la razón PRINCIPAL por la que necesita revisión. Responde SOLO con texto, sin JSON.`;
    return prompt;
  },
};

// ════════════════════════════════════════════════════════════
// CLASSIFY QUICK (Haiku) — short, no CoT
// ════════════════════════════════════════════════════════════

export const CLASSIFY_QUICK = {
  task: "classify_quick" as const,
  version: "1.0",
  system:
    `Eres un contable español experto en el Plan General Contable (PGC). ` +
    `Clasifica movimientos bancarios. Responde SOLO con JSON.`,
  buildUser: (data: { txSummary: string; historySummary: string }) =>
    `<bank_transaction>\n${data.txSummary}\n</bank_transaction>\n\n` +
    `<historical_classifications>\n${data.historySummary}\n</historical_classifications>\n\n` +
    `Clasifica en cuenta PGC. JSON: { accountCode, accountName, cashflowType ("OPERATING"|"INVESTING"|"FINANCING"), confidence (0-1), reasoning (1 frase) }`,
  schema: z.object({
    accountCode: z.string(),
    accountName: z.string(),
    cashflowType: z.enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"]).default("OPERATING"),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// MATCH LLM (Sonnet) — full CoT
// ════════════════════════════════════════════════════════════

export const MATCH_LLM = {
  task: "match_llm" as const,
  version: "1.0",
  system:
    `Eres un asistente de conciliación bancaria para una empresa española.\n` +
    `Tu tarea es analizar si un movimiento bancario corresponde a alguna de las facturas pendientes.\n\n` +
    `REGLAS CRÍTICAS:\n` +
    `- Es MEJOR devolver null (sin match) que forzar un match dudoso.\n` +
    `- Si hay duda entre dos facturas, devuelve la de mayor certeza SOLO si confidence >= 0.65.\n` +
    `- Nunca asumas que un match es correcto solo porque el importe es cercano. Necesitas al menos 2 señales.\n` +
    `- El confidence debe reflejar tu certeza REAL. No infles el número.\n\n` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { txSummary: string; invoiceSummary: string }) =>
    `Analiza este movimiento bancario y decide si corresponde a alguna factura.\n\n` +
    `<bank_transaction>\n${data.txSummary}\n</bank_transaction>\n\n` +
    `<pending_invoices>\n${data.invoiceSummary}\n</pending_invoices>\n\n` +
    `RAZONA PASO A PASO antes de decidir:\n\n` +
    `Paso 1 — IMPORTE: ¿Alguna factura tiene un importe que coincide o es muy cercano (±5%)?\n\n` +
    `Paso 2 — CONTRAPARTIDA: ¿El IBAN, CIF o nombre coincide con algún contacto?\n\n` +
    `Paso 3 — FECHA: ¿Las facturas candidatas tienen fecha cercana al movimiento?\n\n` +
    `Paso 4 — CONCEPTO: ¿El concepto contiene alguna referencia a factura, cliente o proveedor?\n\n` +
    `Paso 5 — DECISIÓN: ¿Hay match claro con al menos 2 señales? Si no, devuelve null.\n\n` +
    `Paso 6 — CONFIDENCE: 0.80=importe+IBAN, 0.70=importe+nombre, 0.65=solo importe, <0.60=null\n\n` +
    `JSON: { steps: { amount_analysis, counterpart_analysis, date_analysis, concept_analysis, decision }, ` +
    `matchedInvoiceId (string|null), confidence (0-1), reasoning (1 frase) }`,
  schema: z.object({
    steps: z.object({
      amount_analysis: z.string().optional(),
      counterpart_analysis: z.string().optional(),
      date_analysis: z.string().optional(),
      concept_analysis: z.string().optional(),
      decision: z.string().optional(),
    }).optional(),
    matchedInvoiceId: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// CLASSIFY LLM (Sonnet) — full CoT
// ════════════════════════════════════════════════════════════

export const CLASSIFY_LLM = {
  task: "classify_llm" as const,
  version: "1.0",
  system:
    `Eres un contable español experto en el Plan General Contable (PGC).\n` +
    `Tu tarea es clasificar un movimiento bancario en la cuenta PGC correcta y el tipo de cashflow.\n\n` +
    `REGLAS CRÍTICAS:\n` +
    `- Si dudas entre dos cuentas del mismo grupo, elige la más genérica y baja el confidence.\n` +
    `- Si dudas entre dos grupos distintos, pon confidence < 0.60.\n` +
    `- Usa las clasificaciones históricas como precedente.\n\n` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { txSummary: string; historySummary: string }) =>
    `Clasifica este movimiento bancario.\n\n` +
    `<bank_transaction>\n${data.txSummary}\n</bank_transaction>\n\n` +
    `<historical_classifications>\n${data.historySummary}\n</historical_classifications>\n\n` +
    `RAZONA PASO A PASO:\n` +
    `1. NATURALEZA: ¿Gasto (6), ingreso (7), activo (2), pasivo (1/4/5)?\n` +
    `2. SUBGRUPO: ¿Qué cuenta específica dentro del grupo?\n` +
    `3. PRECEDENTE: ¿Las clasificaciones históricas sugieren algo?\n` +
    `4. CASHFLOW: ¿Operativo, inversión o financiación?\n` +
    `5. CONFIANZA: ¿Cuán seguro estás?\n\n` +
    `JSON: { steps: { nature, subgroup, precedent, cashflow_reasoning, confidence_reasoning }, ` +
    `accountCode, accountName, cashflowType, confidence (0-1), reasoning (1 frase) }`,
  schema: z.object({
    steps: z.object({
      nature: z.string().optional(),
      subgroup: z.string().optional(),
      precedent: z.string().optional(),
      cashflow_reasoning: z.string().optional(),
      confidence_reasoning: z.string().optional(),
    }).optional(),
    accountCode: z.string(),
    accountName: z.string(),
    cashflowType: z.enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"]).default("OPERATING"),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// PARSE RULE NL (Sonnet) — CoT 7 steps
// ════════════════════════════════════════════════════════════

export const PARSE_RULE_NL = {
  task: "parse_rule_nl" as const,
  version: "1.0",
  system:
    `Eres un asistente de contabilidad español. Interpretas reglas de conciliación escritas en lenguaje natural ` +
    `y las conviertes a reglas estructuradas. Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { ruleText: string; contactList: string; accountList: string }) =>
    `El controller ha escrito esta regla en lenguaje natural:\n\n` +
    `<rule_text>\n${data.ruleText}\n</rule_text>\n\n` +
    `<company_data>\n` +
    `Contactos conocidos:\n${data.contactList || "Ninguno"}\n\n` +
    `Cuentas PGC disponibles:\n${data.accountList || "Ninguna"}\n` +
    `</company_data>\n\n` +
    `RAZONA PASO A PASO:\n` +
    `1. CONTRAPARTIDA: ¿Menciona un cliente/proveedor? Busca en contactos.\n` +
    `2. TIPO: ¿Cobros, pagos o ambos?\n` +
    `3. IMPORTE: ¿Rango o importe fijo?\n` +
    `4. CONCEPTO: ¿Texto que deba aparecer?\n` +
    `5. ACCIÓN: ¿Clasificar, auto-aprobar, escalar?\n` +
    `6. CUENTA PGC: ¿Qué cuenta aplica?\n` +
    `7. ASUNCIONES: Lista lo que has asumido.\n\n` +
    `JSON: { steps: {...}, type, conditions: { counterpartName, counterpartCif, counterpartIban, conceptPattern, ` +
    `minAmount, maxAmount, transactionType, differencePercent }, action, actionDetails: { accountCode, accountName, ` +
    `cashflowType, differenceReason, description }, humanReadable, assumptions: [], suggestions: [] }`,
  schema: z.object({
    steps: z.record(z.string(), z.string()).optional(),
    type: z.string(),
    conditions: z.object({
      counterpartName: z.string().nullable().optional(),
      counterpartCif: z.string().nullable().optional(),
      counterpartIban: z.string().nullable().optional(),
      conceptPattern: z.string().nullable().optional(),
      minAmount: z.number().nullable().optional(),
      maxAmount: z.number().nullable().optional(),
      transactionType: z.string().nullable().optional(),
      differencePercent: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
    }),
    action: z.string(),
    actionDetails: z.object({
      accountCode: z.string().nullable().optional(),
      accountName: z.string().nullable().optional(),
      cashflowType: z.string().nullable().optional(),
      differenceReason: z.string().nullable().optional(),
      description: z.string().optional(),
    }).optional(),
    humanReadable: z.string(),
    assumptions: z.array(z.string()).default([]),
    suggestions: z.array(z.string()).default([]),
  }),
};

// ════════════════════════════════════════════════════════════
// EXPLAIN ANOMALY (Sonnet)
// ════════════════════════════════════════════════════════════

export const EXPLAIN_ANOMALY = {
  task: "explain_anomaly" as const,
  version: "1.0",
  system:
    `Eres un controller financiero español. Explica anomalías de gasto detectadas. ` +
    `Sé conciso (2-3 frases). Responde SOLO con texto, sin JSON.`,
  buildUser: (data: { accountCode: string; accountName: string; currentAmount: number; avgAmount: number; zScore: number; topTx: string }) =>
    `<anomaly_data>\n` +
    `Cuenta: ${data.accountCode} - ${data.accountName}\n` +
    `Gasto este mes: ${data.currentAmount.toFixed(2)} EUR\n` +
    `Media 6 meses: ${data.avgAmount.toFixed(2)} EUR\n` +
    `Desviación: ${data.zScore.toFixed(1)}σ\n` +
    `Transacción más grande este mes:\n${data.topTx}\n` +
    `</anomaly_data>\n\n` +
    `Explica la anomalía al controller.`,
};

// ════════════════════════════════════════════════════════════
// TREASURY ADVICE (Sonnet)
// ════════════════════════════════════════════════════════════

export const TREASURY_ADVICE = {
  task: "treasury_advice" as const,
  version: "1.0",
  system:
    `Eres un tesorero experto español. Da consejos concisos (3-4 frases) sobre gestión de tesorería. ` +
    `Responde SOLO con texto, sin JSON.`,
  buildUser: (data: { currentBalance: number; projectedLow: number; weekLabel: string; details: string }) =>
    `<treasury_data>\n` +
    `Saldo actual: ${data.currentBalance.toFixed(2)} EUR\n` +
    `Saldo proyectado más bajo: ${data.projectedLow.toFixed(2)} EUR (semana ${data.weekLabel})\n` +
    `Detalle:\n${data.details}\n` +
    `</treasury_data>\n\n` +
    `Recomienda acciones para gestionar esta situación de tesorería.`,
};

// ════════════════════════════════════════════════════════════
// DRAFT REMINDER (Sonnet)
// ════════════════════════════════════════════════════════════

export const DRAFT_REMINDER = {
  task: "draft_reminder" as const,
  version: "1.0",
  system:
    `Eres un asistente de cobros. Redacta recordatorios de pago profesionales y cordiales en español. ` +
    `Responde SOLO con el texto del email, sin JSON. Incluye: asunto y cuerpo.`,
  buildUser: (data: { contactName: string; invoiceNumber: string; amount: number; dueDate: string; daysPastDue: number; companyName: string }) =>
    `<invoice_data>\n` +
    `Contacto: ${data.contactName}\n` +
    `Factura: ${data.invoiceNumber}\n` +
    `Importe pendiente: ${data.amount.toFixed(2)} EUR\n` +
    `Vencimiento: ${data.dueDate}\n` +
    `Días de retraso: ${data.daysPastDue}\n` +
    `Empresa emisora: ${data.companyName}\n` +
    `</invoice_data>\n\n` +
    `Redacta un recordatorio de pago. Tono: ${data.daysPastDue > 30 ? "firme pero profesional" : "cordial"}.`,
};

// ════════════════════════════════════════════════════════════
// DAILY BRIEFING (Opus)
// ════════════════════════════════════════════════════════════

export const DAILY_BRIEFING = {
  task: "daily_briefing" as const,
  version: "1.0",
  system:
    `Eres el CFO virtual de un grupo empresarial español. Genera un briefing diario conciso para el controller.\n` +
    `Estructura: 1. GRUPO (3 líneas), 2. ALERTAS, 3. POR SOCIEDAD, 4. ACCIÓN HOY.\n` +
    `Responde SOLO con texto formateado, sin JSON.`,
  buildUser: (data: { orgName: string; metricsJson: string; forecastJson: string; anomaliesJson: string; bandejaCount: number; fiscalJson: string }) =>
    `<company_data>\n` +
    `Organización: ${data.orgName}\n\n` +
    `Métricas del run:\n${data.metricsJson}\n\n` +
    `Previsión de tesorería:\n${data.forecastJson}\n\n` +
    `Anomalías detectadas:\n${data.anomaliesJson}\n\n` +
    `Items en bandeja pendientes: ${data.bandejaCount}\n\n` +
    `Calendario fiscal:\n${data.fiscalJson}\n` +
    `</company_data>\n\n` +
    `Genera el briefing diario.`,
};

// ════════════════════════════════════════════════════════════
// CLOSE PROPOSAL (Opus)
// ════════════════════════════════════════════════════════════

export const CLOSE_PROPOSAL = {
  task: "close_proposal" as const,
  version: "1.0",
  system:
    `Eres un controller financiero español. Genera una propuesta de cierre mensual concisa.\n` +
    `Incluye: checklist, asientos pendientes, intercompañía, resultado estimado.\n` +
    `Responde SOLO con texto formateado, sin JSON.`,
  buildUser: (data: { orgName: string; month: string; checklistJson: string }) =>
    `<company_data>\n` +
    `Organización: ${data.orgName}\n` +
    `Mes de cierre: ${data.month}\n\n` +
    `Checklist:\n${data.checklistJson}\n` +
    `</company_data>\n\n` +
    `Genera la propuesta de cierre.`,
};
