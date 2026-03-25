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
    lines: z
      .array(
        z.object({
          description: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
          total: z.number(),
          vatRate: z.number(),
        })
      )
      .default([]),
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
    txType: string;
    amount: string;
    date: string;
    concept: string;
    counterpart: string;
    matchType: string;
    confidence: string;
    threshold: string;
    matchReason: string;
    invoice?: {
      number: string;
      contact: string;
      amount: string;
      dueDate?: string;
      difference?: string;
      differenceReason?: string;
    };
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
  version: "1.1",
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
    cashflowType: z
      .enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"])
      .default("OPERATING"),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// MATCH LLM (Sonnet) — full CoT
// ════════════════════════════════════════════════════════════

export const MATCH_LLM = {
  task: "match_llm" as const,
  version: "1.1",
  system:
    `Eres un asistente de conciliación bancaria para una empresa española.\n` +
    `Tu tarea es analizar si un movimiento bancario corresponde a alguna de las facturas pendientes.\n\n` +
    `REGLAS CRÍTICAS:\n` +
    `- Es MEJOR devolver null (sin match) que forzar un match dudoso.\n` +
    `- Si hay duda entre dos facturas, devuelve la de mayor certeza SOLO si confidence >= 0.65.\n` +
    `- Nunca asumas que un match es correcto solo porque el importe es cercano. Necesitas al menos 2 señales.\n` +
    `- El confidence debe reflejar tu certeza REAL. No infles el número.\n\n` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { txSummary: string; invoiceSummary: string; controllerContext?: string }) =>
    `Analiza este movimiento bancario y decide si corresponde a alguna factura.\n\n` +
    `<bank_transaction>\n${data.txSummary}\n</bank_transaction>\n\n` +
    `<pending_invoices>\n${data.invoiceSummary}\n</pending_invoices>\n\n` +
    (data.controllerContext ? `${data.controllerContext}\n\n` : "") +
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
    steps: z
      .object({
        amount_analysis: z.string().optional(),
        counterpart_analysis: z.string().optional(),
        date_analysis: z.string().optional(),
        concept_analysis: z.string().optional(),
        decision: z.string().optional(),
      })
      .optional(),
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
  version: "1.1",
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
    steps: z
      .object({
        nature: z.string().optional(),
        subgroup: z.string().optional(),
        precedent: z.string().optional(),
        cashflow_reasoning: z.string().optional(),
        confidence_reasoning: z.string().optional(),
      })
      .optional(),
    accountCode: z.string(),
    accountName: z.string(),
    cashflowType: z
      .enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"])
      .default("OPERATING"),
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
    actionDetails: z
      .object({
        accountCode: z.string().nullable().optional(),
        accountName: z.string().nullable().optional(),
        cashflowType: z.string().nullable().optional(),
        differenceReason: z.string().nullable().optional(),
        description: z.string().optional(),
      })
      .optional(),
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
  buildUser: (data: {
    accountCode: string;
    accountName: string;
    currentAmount: number;
    avgAmount: number;
    zScore: number;
    topTx: string;
  }) =>
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
  buildUser: (data: {
    currentBalance: number;
    projectedLow: number;
    weekLabel: string;
    details: string;
  }) =>
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
  buildUser: (data: {
    contactName: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysPastDue: number;
    companyName: string;
  }) =>
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
  version: "2.0",
  system:
    `Eres el CFO virtual de un grupo empresarial español. Genera un briefing diario conciso para el controller.\n` +
    `Estructura:\n` +
    `1. GRUPO (3 líneas): facturación consolidada, EBITDA, tesorería del grupo.\n` +
    `2. CONSOLIDACIÓN: NCI, eliminaciones IC pendientes, FX si aplica.\n` +
    `3. POR SOCIEDAD: 1-2 líneas cada una con resultado y método de consolidación.\n` +
    `4. ALERTAS: anomalías, tesorería, morosos, fiscal.\n` +
    `5. ACCIÓN HOY: la 1 cosa más importante.\n` +
    `Responde SOLO con texto formateado, sin JSON.`,
  buildUser: (data: {
    orgName: string;
    metricsJson: string;
    forecastJson: string;
    anomaliesJson: string;
    bandejaCount: number;
    fiscalJson: string;
    consolidationJson?: string;
  }) =>
    `<company_data>\n` +
    `Organización: ${data.orgName}\n\n` +
    `Métricas del run:\n${data.metricsJson}\n\n` +
    `Previsión de tesorería:\n${data.forecastJson}\n\n` +
    `Anomalías detectadas:\n${data.anomaliesJson}\n\n` +
    `Items en bandeja pendientes: ${data.bandejaCount}\n\n` +
    `Calendario fiscal:\n${data.fiscalJson}\n` +
    `</company_data>\n\n` +
    (data.consolidationJson
      ? `<consolidation_data>\n${data.consolidationJson}\n</consolidation_data>\n\n`
      : "") +
    `Genera el briefing diario.`,
};

// ════════════════════════════════════════════════════════════
// CLOSE PROPOSAL (Opus)
// ════════════════════════════════════════════════════════════

export const CLOSE_PROPOSAL = {
  task: "close_proposal" as const,
  version: "2.0",
  system:
    `Eres un controller financiero español experto en consolidación. Genera una propuesta de cierre mensual.\n` +
    `Estructura en 2 secciones:\n` +
    `1. POR SOCIEDAD: checklist de cada empresa (txs pendientes, asientos, periodo abierto/cerrado).\n` +
    `2. CONSOLIDACIÓN GRUPO: eliminaciones IC, NCI, FX, equity method, asientos de consolidación.\n` +
    `Responde SOLO con texto formateado, sin JSON.`,
  buildUser: (data: {
    orgName: string;
    month: string;
    checklistJson: string;
    consolidationJson?: string;
  }) =>
    `<company_data>\n` +
    `Organización: ${data.orgName}\n` +
    `Mes de cierre: ${data.month}\n\n` +
    `Checklist por sociedad:\n${data.checklistJson}\n` +
    `</company_data>\n\n` +
    (data.consolidationJson
      ? `<consolidation_data>\n${data.consolidationJson}\n</consolidation_data>\n\n`
      : "") +
    `Genera la propuesta de cierre.`,
};

// ════════════════════════════════════════════════════════════
// CONSOLIDATION REVIEW (Opus)
// ════════════════════════════════════════════════════════════

export const CONSOLIDATION_REVIEW = {
  task: "consolidation_review" as const,
  version: "1.0",
  system:
    `Eres un auditor de consolidación contable español. Revisa las cifras consolidadas y señala inconsistencias.\n` +
    `Para cada check, indica: OK ✅, WARN ⚠️ o ERROR ❌.\n` +
    `Checks: 1) Eliminaciones IC completas, 2) NCI coherente con % participación,\n` +
    `3) Equity method correcto, 4) Saldos IC cuadrados, 5) FX aplicado si hay moneda ≠ EUR.\n` +
    `Responde SOLO con texto formateado.`,
  buildUser: (data: {
    perCompanyJson: string;
    eliminationsJson: string;
    nciAmount: number;
    consolidatedJson: string;
  }) =>
    `<consolidation_data>\n` +
    `Resultados por sociedad:\n${data.perCompanyJson}\n\n` +
    `Eliminaciones IC propuestas:\n${data.eliminationsJson}\n\n` +
    `NCI (intereses minoritarios): ${data.nciAmount.toFixed(2)} EUR\n\n` +
    `Totales consolidados:\n${data.consolidatedJson}\n` +
    `</consolidation_data>\n\n` +
    `Revisa la consolidación y genera el informe de checks.`,
};

// ════════════════════════════════════════════════════════════
// IC ELIMINATION EXPLAIN (Sonnet)
// ════════════════════════════════════════════════════════════

export const IC_ELIMINATION_EXPLAIN = {
  task: "ic_elimination_explain" as const,
  version: "1.0",
  system:
    `Eres un contable español experto en consolidación. Explica eliminaciones intercompañía.\n` +
    `Indica: tipo (ingreso/gasto, deudor/acreedor, dividendo, préstamo), asiento propuesto, impacto en consolidado.\n` +
    `Responde SOLO con texto, 3-4 frases.`,
  buildUser: (data: {
    companyA: string;
    companyB: string;
    amount: number;
    accountA: string;
    accountB: string;
    txConcept: string;
  }) =>
    `<intercompany_data>\n` +
    `Sociedad A: ${data.companyA} → cuenta ${data.accountA}\n` +
    `Sociedad B: ${data.companyB} → cuenta ${data.accountB}\n` +
    `Importe: ${data.amount.toFixed(2)} EUR\n` +
    `Concepto: ${data.txConcept}\n` +
    `</intercompany_data>\n\n` +
    `Explica esta eliminación intercompañía.`,
};

// ════════════════════════════════════════════════════════════
// EXPLAIN GROUP ANOMALY (Sonnet)
// ════════════════════════════════════════════════════════════

export const EXPLAIN_GROUP_ANOMALY = {
  task: "explain_group_anomaly" as const,
  version: "1.0",
  system:
    `Eres un controller de grupo español. Explica anomalías a nivel de grupo (no individuales).\n` +
    `Tipos: desequilibrio IC, spike consolidado, drift de NCI, impacto FX.\n` +
    `Responde con 2-3 frases. SOLO texto.`,
  buildUser: (data: { anomalyType: string; details: string }) =>
    `<anomaly_data>\n` +
    `Tipo: ${data.anomalyType}\n` +
    `Detalle:\n${data.details}\n` +
    `</anomaly_data>\n\n` +
    `Explica esta anomalía de grupo al controller.`,
};

// ════════════════════════════════════════════════════════════
// VARIANCE CONSOLIDATED (Sonnet)
// ════════════════════════════════════════════════════════════

export const VARIANCE_CONSOLIDATED = {
  task: "variance_consolidated" as const,
  version: "1.0",
  system:
    `Eres un analista financiero español. Descompón la variación consolidada.\n` +
    `Factores: volumen, precio, mix de subsidiarias, scope (nuevas/vendidas), FX, one-offs.\n` +
    `Responde con 3-5 frases analíticas. SOLO texto.`,
  buildUser: (data: {
    lineCode: string;
    lineName: string;
    actual: number;
    budget: number;
    priorYear: number;
    perCompanyBreakdown: string;
  }) =>
    `<variance_data>\n` +
    `Línea: ${data.lineCode} - ${data.lineName}\n` +
    `Actual: ${data.actual.toFixed(2)} EUR\n` +
    `Presupuesto: ${data.budget.toFixed(2)} EUR\n` +
    `Año anterior: ${data.priorYear.toFixed(2)} EUR\n\n` +
    `Desglose por sociedad:\n${data.perCompanyBreakdown}\n` +
    `</variance_data>\n\n` +
    `Descompón la variación consolidada.`,
};

// ════════════════════════════════════════════════════════════
// DRAFT INQUIRY (Sonnet) — email drafting for documentation requests
// ════════════════════════════════════════════════════════════

export const DRAFT_INQUIRY = {
  task: "draft_inquiry" as const,
  version: "1.0",
  system:
    `Eres el asistente del controller financiero. Redactas emails profesionales solicitando documentación financiera.\n\n` +
    `REGLAS:\n` +
    `1. Sé conciso y claro. El destinatario no es contable — usa lenguaje simple.\n` +
    `2. Indica EXACTAMENTE qué documento necesitas (factura nº, fecha, importe, concepto).\n` +
    `3. Da un plazo razonable (5 días laborables para primera solicitud).\n` +
    `4. En follow-ups, haz referencia al email anterior y sé más directo.\n` +
    `5. NUNCA amenaces. Sé firme pero profesional.\n` +
    `6. SIEMPRE incluye los datos concretos para que el destinatario localice el documento.\n` +
    `7. Firma como el departamento de administración.\n` +
    `8. Si es follow-up 2+, menciona que es urgente por cierre de periodo.\n\n` +
    `Responde SOLO con JSON: { subject, htmlBody, plainBody }`,
  buildUser: (data: {
    trigger: string;
    companyName: string;
    contactName: string;
    accountingContact?: string;
    amount?: number;
    date?: string;
    concept?: string;
    invoiceNumber?: string;
    followUpNumber: number;
    previousSubject?: string;
    tone: string;
  }) => {
    let context = `<inquiry_context>\n`;
    context += `Empresa: ${data.companyName}\n`;
    context += `Destinatario: ${data.contactName}${data.accountingContact ? ` (att: ${data.accountingContact})` : ""}\n`;
    context += `Tipo de solicitud: ${data.trigger}\n`;
    context += `Tono: ${data.tone}\n`;
    context += `Follow-up nº: ${data.followUpNumber} (0 = primera solicitud)\n`;
    if (data.amount) context += `Importe: ${data.amount.toFixed(2)} EUR\n`;
    if (data.date) context += `Fecha: ${data.date}\n`;
    if (data.concept) context += `Concepto: ${data.concept}\n`;
    if (data.invoiceNumber) context += `Factura: ${data.invoiceNumber}\n`;
    if (data.previousSubject) context += `Asunto del email anterior: ${data.previousSubject}\n`;
    context += `</inquiry_context>\n\n`;
    context += `Redacta el email. JSON: { subject (string), htmlBody (HTML string), plainBody (text string) }`;
    return context;
  },
  schema: z.object({
    subject: z.string(),
    htmlBody: z.string(),
    plainBody: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// ANALYZE INQUIRY RESPONSE (Haiku) — parse response to an inquiry
// ════════════════════════════════════════════════════════════

export const ANALYZE_INQUIRY_RESPONSE = {
  task: "analyze_inquiry_response" as const,
  version: "1.0",
  system:
    `Analiza la respuesta a una solicitud de documentación financiera.\n` +
    `Determina si la respuesta resuelve la consulta original.\n` +
    `Responde SOLO con JSON.`,
  buildUser: (data: {
    originalSubject: string;
    originalTrigger: string;
    responseText: string;
    hasAttachments: boolean;
    attachmentNames: string[];
  }) =>
    `<inquiry_response>\n` +
    `Solicitud original: ${data.originalSubject}\n` +
    `Tipo: ${data.originalTrigger}\n` +
    `Texto de la respuesta: ${data.responseText}\n` +
    `Adjuntos: ${data.hasAttachments ? data.attachmentNames.join(", ") : "Ninguno"}\n` +
    `</inquiry_response>\n\n` +
    `JSON: { resolved (boolean), summary (string, 1-2 frases), hasRelevantAttachment (boolean), needsFollowUp (boolean), followUpReason (string|null) }`,
  schema: z.object({
    resolved: z.boolean(),
    summary: z.string(),
    hasRelevantAttachment: z.boolean(),
    needsFollowUp: z.boolean(),
    followUpReason: z.string().nullable(),
  }),
};

// ════════════════════════════════════════════════════════════
// EVALUATE INQUIRY RESPONSE (Sonnet) — full response evaluation with CoT
// ════════════════════════════════════════════════════════════

export const EVALUATE_INQUIRY_RESPONSE = {
  task: "evaluate_inquiry_response" as const,
  version: "1.0",
  system:
    `Eres un controller financiero analizando la respuesta de un proveedor/cliente a una solicitud de documentación.\n\n` +
    `Analiza paso a paso:\n` +
    `1. ¿Han adjuntado lo que pedimos? (sí/no/parcialmente/otra cosa)\n` +
    `2. ¿El texto promete enviar algo? Si sí, ¿cuándo?\n` +
    `3. ¿Disputan algo? (importe, autoría, concepto)\n` +
    `4. ¿Nos redirigen a alguien? (extraer nombre, email, departamento)\n` +
    `5. ¿Nos preguntan algo?\n` +
    `6. ¿Es solo un acuse de recibo sin contenido útil?\n` +
    `7. ¿Es una respuesta automática (fuera de oficina)?\n\n` +
    `Responde SOLO con JSON válido.`,
  buildUser: (data: {
    originalSubject: string;
    originalTrigger: string;
    responseText: string;
    hasAttachments: boolean;
    attachmentTypes: string[];
    amountExpected?: number;
  }) =>
    `<inquiry_context>\n` +
    `Solicitud original: ${data.originalSubject}\n` +
    `Tipo: ${data.originalTrigger}\n` +
    `Importe esperado: ${data.amountExpected != null ? `${Math.abs(data.amountExpected).toFixed(2)} EUR` : "N/A"}\n` +
    `</inquiry_context>\n\n` +
    `<response_email>\n${data.responseText}\n</response_email>\n\n` +
    `Adjuntos: ${data.hasAttachments ? data.attachmentTypes.join(", ") : "Ninguno"}\n\n` +
    `JSON: { responseType ("DOCUMENT_ATTACHED"|"DOCUMENT_PROMISED"|"EXPLANATION_GIVEN"|"PARTIAL_RESPONSE"|` +
    `"DISPUTE"|"REDIRECT"|"QUESTION_BACK"|"OUT_OF_OFFICE"|"ACKNOWLEDGMENT_ONLY"|"UNRELATED"|"UNCLEAR"), ` +
    `sentiment ("cooperative"|"neutral"|"reluctant"|"hostile"), ` +
    `promisedDeliveryDate (YYYY-MM-DD|null), ` +
    `redirectContact ({ name, email, department }|null), ` +
    `questionAsked (string|null), disputeReason (string|null), summary (1-2 frases) }`,
  schema: z.object({
    responseType: z.string(),
    sentiment: z.enum(["cooperative", "neutral", "reluctant", "hostile"]),
    promisedDeliveryDate: z.string().nullable(),
    redirectContact: z
      .object({
        name: z.string().nullable(),
        email: z.string().nullable(),
        department: z.string().nullable(),
      })
      .nullable(),
    questionAsked: z.string().nullable(),
    disputeReason: z.string().nullable(),
    summary: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// CLASSIFY INVESTMENT/CAPEX (Sonnet)
// ════════════════════════════════════════════════════════════

export const CLASSIFY_INVESTMENT_CAPEX = {
  task: "classify_investment_capex" as const,
  version: "1.0",
  system:
    `Eres un controller financiero experto en PGC español 2007.\n` +
    `Determina si el movimiento es: Operativo, CAPEX (grupo 2xx), Inversión financiera (24x/25x/54x), o Financiación (17x/52x).\n` +
    `Razona en 3 pasos. Responde SOLO en JSON.`,
  buildUser: (data: {
    amount: number;
    concept: string;
    counterpartyName: string | null;
    counterpartyHistory: string;
    existingInvestments: string;
  }) =>
    `<bank_transaction>\nImporte: ${data.amount} EUR\nConcepto: ${data.concept}\nContrapartida: ${data.counterpartyName ?? "Desconocido"}\n</bank_transaction>\n` +
    `<context>\nHistorial: ${data.counterpartyHistory}\nInversiones: ${data.existingInvestments || "ninguna"}\n</context>`,
  schema: z.object({
    category: z.string(),
    suggestedPgcAccount: z.string(),
    reasoning: z.string(),
    confidence: z.number().min(0).max(1),
    requiredDocumentTypes: z.array(z.string()),
  }),
};

// ════════════════════════════════════════════════════════════
// EXPLAIN INVESTMENT BANDEJA (Haiku)
// ════════════════════════════════════════════════════════════

export const EXPLAIN_INVESTMENT_BANDEJA = {
  task: "explain_investment_bandeja" as const,
  version: "1.0",
  system: `Eres el controller. Explica en 2 frases: 1) qué tipo de operación parece 2) qué documento necesitas. Terminología PGC española.`,
  buildUser: (data: {
    amount: number;
    concept: string;
    suggestedCategory: string;
    suggestedPgcAccount: string;
    requiredDocuments: string[];
  }) =>
    `<movement>\nImporte: ${data.amount} EUR\nConcepto: ${data.concept}\nTipo: ${data.suggestedCategory}\nCuenta PGC: ${data.suggestedPgcAccount}\nDocumentos: ${data.requiredDocuments.join(", ")}\n</movement>`,
};

// ════════════════════════════════════════════════════════════
// CLASSIFY FINANCING MOVEMENT (Haiku)
// ════════════════════════════════════════════════════════════

export const CLASSIFY_FINANCING_MOVEMENT = {
  task: "classify_financing_movement" as const,
  version: "1.0",
  system:
    `Eres un tesorero español experto en financiación bancaria (PGC 2007).\n` +
    `Clasifica un movimiento bancario como operación de financiación.\n` +
    `Tipos posibles: CUOTA_PRESTAMO, DISPOSICION_CREDITO, DEVOLUCION_CREDITO, LIQUIDACION_INTERESES, ` +
    `COMISION_BANCARIA, ANTICIPO_DESCUENTO, VENCIMIENTO_DESCUENTO, LEASING, OTRO.\n` +
    `Responde SOLO con JSON.`,
  buildUser: (data: {
    amount: number;
    concept: string;
    counterpartName: string | null;
    counterpartIban: string | null;
    debtInstruments: string;
  }) =>
    `<bank_transaction>\n` +
    `Importe: ${data.amount} EUR\n` +
    `Concepto: ${data.concept}\n` +
    `Contrapartida: ${data.counterpartName ?? "Desconocido"}\n` +
    `IBAN: ${data.counterpartIban ?? "N/A"}\n` +
    `</bank_transaction>\n\n` +
    `<debt_instruments>\n${data.debtInstruments}\n</debt_instruments>\n\n` +
    `JSON: { type, debtInstrumentId (string|null), principalAmount (number|null), interestAmount (number|null), confidence (0-1), reasoning (1 frase) }`,
  schema: z.object({
    type: z.string(),
    debtInstrumentId: z.string().nullable(),
    principalAmount: z.number().nullable(),
    interestAmount: z.number().nullable(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// DECOMPOSE INTEREST SETTLEMENT (Sonnet)
// ════════════════════════════════════════════════════════════

export const DECOMPOSE_INTEREST_SETTLEMENT = {
  task: "decompose_interest_settlement" as const,
  version: "1.0",
  system:
    `Eres un tesorero español. Descompón una liquidación de intereses bancaria en sus componentes.\n` +
    `Identifica: intereses deudores (662), intereses acreedores (769), comisiones (626), ` +
    `retenciones IRPF sobre intereses (473/769), y cualquier otro concepto.\n` +
    `Razona paso a paso. Responde SOLO con JSON.`,
  buildUser: (data: { amount: number; concept: string; debtInstruments: string }) =>
    `<bank_transaction>\n` +
    `Importe: ${data.amount} EUR\n` +
    `Concepto: ${data.concept}\n` +
    `</bank_transaction>\n\n` +
    `<debt_instruments>\n${data.debtInstruments}\n</debt_instruments>\n\n` +
    `RAZONA:\n` +
    `1. ¿Es una liquidación trimestral o mensual?\n` +
    `2. ¿Incluye intereses deudores (cargo)?\n` +
    `3. ¿Incluye intereses acreedores (abono)?\n` +
    `4. ¿Incluye comisiones?\n` +
    `5. ¿Tiene retención IRPF sobre intereses?\n\n` +
    `JSON: { steps: { period, debtInterest, creditInterest, commissions, withholding }, ` +
    `components: [{ type ("INTEREST_DEBIT"|"INTEREST_CREDIT"|"COMMISSION"|"WITHHOLDING"|"OTHER"), ` +
    `amount, pgcDebitAccount, pgcCreditAccount, description }], ` +
    `confidence (0-1), reasoning (1 frase) }`,
  schema: z.object({
    steps: z
      .object({
        period: z.string().optional(),
        debtInterest: z.string().optional(),
        creditInterest: z.string().optional(),
        commissions: z.string().optional(),
        withholding: z.string().optional(),
      })
      .optional(),
    components: z.array(
      z.object({
        type: z.string(),
        amount: z.number(),
        pgcDebitAccount: z.string(),
        pgcCreditAccount: z.string(),
        description: z.string(),
      })
    ),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// CLASSIFY MATCH DIFFERENCE (Haiku)
// ════════════════════════════════════════════════════════════

export const CLASSIFY_MATCH_DIFFERENCE = {
  task: "classify_match_difference" as const,
  version: "1.0",
  system: `Analiza la diferencia entre un cobro bancario y una factura. Determina la causa más probable. Responde SOLO en JSON.`,
  buildUser: (data: {
    txAmount: number;
    invoiceAmount: number;
    difference: number;
    differencePct: number;
    txConcept: string;
  }) =>
    `<match_data>\nCobrado: ${data.txAmount} EUR\nFacturado: ${data.invoiceAmount} EUR\nDiferencia: ${data.difference} EUR (${data.differencePct.toFixed(2)}%)\nConcepto: ${data.txConcept}\n</match_data>`,
  schema: z.object({
    differenceType: z.string(),
    suggestedPgcAccount: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// DRAFT CLARIFICATION EMAIL (Sonnet)
// ════════════════════════════════════════════════════════════

export const DRAFT_CLARIFICATION_EMAIL = {
  task: "draft_clarification_email" as const,
  version: "1.0",
  system:
    `Eres el controller financiero. Redacta un email al cliente solicitando aclaración sobre una diferencia en el pago.\n` +
    `Identifica factura y pago con datos concretos. Menciona la diferencia sin acusar. Pide respuesta en 3 días hábiles.\n` +
    `Formato: ASUNTO: [asunto] en primera línea, luego el cuerpo. SOLO texto.`,
  buildUser: (data: {
    invoiceNumber: string;
    invoiceAmount: number;
    receivedAmount: number;
    difference: number;
    clientName: string;
    companyName: string;
  }) =>
    `<invoice>\nNúmero: ${data.invoiceNumber}\nImporte: ${data.invoiceAmount} EUR\n</invoice>\n` +
    `<payment>\nCobrado: ${data.receivedAmount} EUR\nDiferencia: ${data.difference} EUR\n</payment>\n` +
    `<context>\nCliente: ${data.clientName}\nNuestra empresa: ${data.companyName}\n</context>`,
};

// ════════════════════════════════════════════════════════════
// PARSE CLARIFICATION REPLY (Haiku)
// ════════════════════════════════════════════════════════════

export const PARSE_CLARIFICATION_REPLY = {
  task: "parse_clarification_reply" as const,
  version: "1.0",
  system: `Analiza la respuesta de un cliente sobre una diferencia en un pago. Extrae si explica la razón. Responde SOLO en JSON.`,
  buildUser: (emailBody: string) => `<reply>\n${emailBody.substring(0, 2000)}\n</reply>`,
  schema: z.object({
    explainsDifference: z.boolean(),
    reason: z.string().nullable(),
    suggestedDifferenceType: z.string().nullable(),
    summary: z.string(),
  }),
};

// ════════════════════════════════════════════════════════════
// AGENT MODULE STUBS — Pre-implementation infrastructure
// ════════════════════════════════════════════════════════════

// ── Module 01: Contacts Agent ──

export const DETECT_CONTACT_FROM_EMAIL = {
  task: "detect_contact_from_email" as const,
  version: "1.0",
  system:
    `Eres un extractor de datos de contacto de emails y facturas españolas. ` +
    `Extrae: nombre, NIF/CIF, email, tipo (supplier/client). ` +
    `Infiere si es posible: IRPF aplicable, plazo de pago habitual, importe típico. ` +
    `Confidence "high" SOLO si NIF + nombre están confirmados en el documento. ` +
    `"medium" si nombre claro pero sin NIF. "low" si solo email. ` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { from: string; subject: string; body: string; attachmentNames: string[] }) =>
    `Analiza este email y extrae datos del contacto remitente.\n\n` +
    `<email_data>\n` +
    `From: ${data.from}\n` +
    `Subject: ${data.subject}\n` +
    `Body: ${data.body.slice(0, 2000)}\n` +
    `Attachments: ${data.attachmentNames.join(", ") || "none"}\n` +
    `</email_data>\n\n` +
    `Return JSON: { name, nif (string|null), email, type ("SUPPLIER"|"CUSTOMER"), ` +
    `irpfApplicable (boolean|null), paymentTermsDays (number|null), ` +
    `typicalAmount (number|null), confidence ("high"|"medium"|"low") }`,
  schema: z.object({
    name: z.string(),
    nif: z.string().nullable(),
    email: z.string().nullable(),
    type: z.enum(["SUPPLIER", "CUSTOMER"]).default("SUPPLIER"),
    irpfApplicable: z.boolean().nullable().default(null),
    paymentTermsDays: z.number().nullable().default(null),
    typicalAmount: z.number().nullable().default(null),
    confidence: z.enum(["high", "medium", "low"]).default("low"),
  }),
};

export const IMPORT_CONTACTS_FILE = {
  task: "import_contacts_file" as const,
  version: "1.0",
  system:
    `Eres un parseador de archivos de contactos para empresas españolas. ` +
    `Detecta el formato del archivo (Holded, Sage, A3, generic CSV). ` +
    `Mapea columnas al esquema estándar. Valida NIF/CIF (formato español). ` +
    `Valida emails. Ignora filas sin nombre. ` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { content: string; filename: string }) =>
    `Analiza este archivo de contactos y extrae los datos.\n\n` +
    `<contacts_file>\n` +
    `Filename: ${data.filename}\n` +
    `Content (first 5000 chars):\n${data.content.slice(0, 5000)}\n` +
    `</contacts_file>\n\n` +
    `Return JSON: { formatDetected ("holded"|"sage"|"a3"|"generic"), ` +
    `contacts: [{ name, nif (string|null), email (string|null), iban (string|null), ` +
    `type ("SUPPLIER"|"CUSTOMER"|"BOTH"), paymentTermsDays (number|null) }], ` +
    `warnings: string[] }`,
  schema: z.object({
    formatDetected: z.enum(["holded", "sage", "a3", "generic"]).default("generic"),
    contacts: z.array(
      z.object({
        name: z.string(),
        nif: z.string().nullable().default(null),
        email: z.string().nullable().default(null),
        iban: z.string().nullable().default(null),
        type: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).default("SUPPLIER"),
        paymentTermsDays: z.number().nullable().default(null),
      })
    ),
    warnings: z.array(z.string()).default([]),
  }),
};

export const ENRICH_CONTACT_FROM_HISTORY = {
  task: "enrich_contact_from_history" as const,
  version: "1.0",
  system:
    `Eres un analista financiero español. A partir del historial de movimientos bancarios ` +
    `de un contacto, infiere sus condiciones de pago y comportamiento. ` +
    `Analiza: plazo medio de pago (días), importe típico, frecuencia, ` +
    `patrón de IRPF (retención habitual), riesgo de morosidad. ` +
    `Con >= 6 movimientos: confidence "high". 3-5: "medium". <3: devuelve nulls con confidence "low". ` +
    `RAZONA PASO A PASO antes de responder.\n` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { contactName: string; contactType: string; transactions: string }) =>
    `Analiza el historial de movimientos de este contacto e infiere condiciones de pago.\n\n` +
    `<company_data>\n` +
    `Contact: ${data.contactName} (${data.contactType})\n` +
    `</company_data>\n\n` +
    `<bank_transaction>\n${data.transactions}\n</bank_transaction>\n\n` +
    `Return JSON: { paymentTermsDays (number|null), typicalAmountAvg (number|null), ` +
    `frequency ("monthly"|"quarterly"|"irregular"|null), ` +
    `irpfApplicable (boolean|null), irpfRateImplied (number|null, decimal e.g. 0.15), ` +
    `latePaymentRisk ("low"|"medium"|"high"|null), avgPaymentDays (number|null), ` +
    `confidence ("high"|"medium"|"low"), reasoning (string) }`,
  schema: z.object({
    paymentTermsDays: z.number().nullable().default(null),
    typicalAmountAvg: z.number().nullable().default(null),
    frequency: z.enum(["monthly", "quarterly", "irregular"]).nullable().default(null),
    irpfApplicable: z.boolean().nullable().default(null),
    irpfRateImplied: z.number().nullable().default(null),
    latePaymentRisk: z.enum(["low", "medium", "high"]).nullable().default(null),
    avgPaymentDays: z.number().nullable().default(null),
    confidence: z.enum(["high", "medium", "low"]).default("low"),
    reasoning: z.string().default(""),
  }),
};

export const DEDUPLICATE_CONTACTS = {
  task: "deduplicate_contacts" as const,
  version: "1.0",
  system:
    `Eres un experto en limpieza de datos de contactos empresariales españoles. ` +
    `Detecta posibles duplicados entre contactos. ` +
    `REGLAS:\n` +
    `- Mismo NIF/CIF (normalizado, sin guiones) = duplicado CIERTO.\n` +
    `- Nombre similar + mismo email = duplicado PROBABLE (confidence >= 0.8).\n` +
    `- Nombre similar sin NIF ni email común = POSIBLE (confidence 0.5-0.7).\n` +
    `- Filiales distintas con NIFs diferentes NO son duplicados.\n` +
    `- Normaliza NIF: quita guiones, puntos, espacios, mayúsculas.\n` +
    `Responde SOLO con JSON válido, sin markdown.`,
  buildUser: (data: { contacts: string }) =>
    `Analiza esta lista de contactos y detecta posibles duplicados.\n\n` +
    `<company_data>\n${data.contacts}\n</company_data>\n\n` +
    `Return JSON: { duplicateGroups: [{ contactIds: string[], confidence (0-1), ` +
    `reason (string), canonicalId (string, the most complete contact) }] }`,
  schema: z.object({
    duplicateGroups: z.array(
      z.object({
        contactIds: z.array(z.string()),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
        canonicalId: z.string(),
      })
    ),
  }),
};

// ── Module 02: Onboarding Agent ──

export const ONBOARDING_INFERENCE = {
  task: "onboarding_inference" as const,
  version: "1.0",
  system:
    `You are a Spanish accounting expert specializing in PGC 2007 (Plan General Contable). ` +
    `Given a company's business profile, infer the optimal chart of accounts (subplan PGC), ` +
    `applicable fiscal modules, and default counterparts for common concepts.\n\n` +
    `Rules:\n` +
    `- ONLY use real PGC 2007 account codes (4 digits). No invented codes.\n` +
    `- Fiscal modules must include legal basis (Art + Ley). e.g. "Art. 164 Ley 37/1992" for IVA.\n` +
    `- Status: "active" (will use), "probable" (likely), "inactive" (not expected).\n` +
    `- Include default counterparts for common concepts: nóminas→640/465, alquiler→621/410, ` +
    `suministros→628/410, seguros→625/410, amortización→681/281, ventas→700/430, ` +
    `compras→600/400, intereses→662/520, comisiones bancarias→626/572.\n` +
    `- For distribución: grupo 3 (existencias) active. For servicios: grupo 3 inactive.\n` +
    `- For empresas con nóminas: modelo 111 active.\n` +
    `- Confidence 0-1 for each account.\n\n` +
    `Respond with ONLY valid JSON, no markdown.`,
  buildUser: (data: {
    empresa: string;
    nif: string;
    forma_juridica: string;
    sector: string;
    regimen_iva: string;
    irpf_retenciones: boolean;
    actividad: string;
    canales: string[];
    cobro: string;
  }) =>
    `Analiza este perfil empresarial e infiere el subplan PGC óptimo.\n\n` +
    `<company_data>\n` +
    `Empresa: ${data.empresa}\n` +
    `NIF: ${data.nif}\n` +
    `Forma jurídica: ${data.forma_juridica}\n` +
    `Sector: ${data.sector}\n` +
    `Régimen IVA: ${data.regimen_iva}\n` +
    `Retenciones IRPF: ${data.irpf_retenciones ? "Sí" : "No"}\n` +
    `Actividad: ${data.actividad}\n` +
    `Canales: ${data.canales.join(", ")}\n` +
    `Cobro habitual: ${data.cobro}\n` +
    `</company_data>\n\n` +
    `Return JSON: { subplan: [{code, name, status, confidence, reason}], ` +
    `fiscal_modules: [{model, name, periodicity, active, legal_basis}], ` +
    `default_counterparts: [{concept, debit_account, credit_account}], ` +
    `warnings: string[], summary: string }`,
  schema: z.object({
    subplan: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        status: z.enum(["active", "probable", "inactive"]),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
      })
    ),
    fiscal_modules: z.array(
      z.object({
        model: z.string(),
        name: z.string(),
        periodicity: z.string(),
        active: z.boolean(),
        legal_basis: z.string(),
      })
    ),
    default_counterparts: z.array(
      z.object({
        concept: z.string(),
        debit_account: z.string(),
        credit_account: z.string(),
      })
    ),
    warnings: z.array(z.string()).default([]),
    summary: z.string(),
  }),
};

export const PARSE_HISTORICAL_FILE = {
  task: "parse_historical_file" as const,
  version: "1.0",
  system:
    `You are a Spanish accounting file parser. Parse accounting data files (CSV/Excel text). ` +
    `Detect the format: balance de sumas y saldos, libro diario, Holded export, Sage export, ` +
    `A3 export, or generic CSV. Extract accounts with their movements and balances.\n\n` +
    `Rules:\n` +
    `- Detect column structure automatically from headers or first data rows.\n` +
    `- Account codes must be valid PGC format (3-5 digits).\n` +
    `- Report confidence 0-1 based on how well you understood the format.\n` +
    `- Include parse_warnings for any ambiguity or data quality issues.\n\n` +
    `Respond with ONLY valid JSON, no markdown.`,
  buildUser: (data: { content: string; filename: string }) =>
    `Parse this accounting file and extract structured account data.\n\n` +
    `<historical_file>\n` +
    `Filename: ${data.filename}\n` +
    `Content:\n${data.content}\n` +
    `</historical_file>\n\n` +
    `Return JSON: { format_detected, periods_found: string[], confidence, ` +
    `accounts: [{code, name, has_movement, net_balance}], parse_warnings: string[] }`,
  schema: z.object({
    format_detected: z.string(),
    periods_found: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1),
    accounts: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        has_movement: z.boolean(),
        net_balance: z.number(),
      })
    ),
    parse_warnings: z.array(z.string()).default([]),
  }),
};

export const CALIBRATE_ACCOUNT_PLAN = {
  task: "calibrate_account_plan" as const,
  version: "1.0",
  system:
    `You are a Spanish accounting expert. Compare an inferred PGC account plan with historical ` +
    `accounting data to calibrate and improve the plan.\n\n` +
    `Rules:\n` +
    `- Confirm accounts that appear in both inferred and historical data.\n` +
    `- Add accounts found in historical data but missing from inferred plan.\n` +
    `- Mark as inactive accounts inferred but with zero historical movement.\n` +
    `- Flag anomalies: 551 (socios/deudas con socios), 170/520 (préstamos no declarados), ` +
    `553 (cuentas corrientes con socios), unusual balances in grupo 1.\n` +
    `- Extract recurring patterns: concepts that appear >=3 times with similar counterparts.\n` +
    `- Severity: "info", "warning", "critical".\n\n` +
    `Respond with ONLY valid JSON, no markdown.`,
  buildUser: (data: {
    inferred_plan: unknown;
    historical_accounts: unknown;
    business_profile: unknown;
  }) =>
    `Compare the inferred plan with historical data and calibrate.\n\n` +
    `<inferred_plan>\n${JSON.stringify(data.inferred_plan)}\n</inferred_plan>\n\n` +
    `<historical_accounts>\n${JSON.stringify(data.historical_accounts)}\n</historical_accounts>\n\n` +
    `<company_data>\n${JSON.stringify(data.business_profile)}\n</company_data>\n\n` +
    `Return JSON: { accounts_confirmed: [{code, name}], accounts_added: [{code, name, reason}], ` +
    `accounts_inactive: [{code, name, reason}], ` +
    `anomalies: [{code, message, severity}], ` +
    `recurring_patterns: [{concept, counterpart, frequency, avg_amount, confidence}], ` +
    `calibration_summary: string }`,
  schema: z.object({
    accounts_confirmed: z.array(z.object({ code: z.string(), name: z.string() })),
    accounts_added: z.array(z.object({ code: z.string(), name: z.string(), reason: z.string() })),
    accounts_inactive: z.array(
      z.object({ code: z.string(), name: z.string(), reason: z.string() })
    ),
    anomalies: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        severity: z.enum(["info", "warning", "critical"]),
      })
    ),
    recurring_patterns: z.array(
      z.object({
        concept: z.string(),
        counterpart: z.string(),
        frequency: z.number(),
        avg_amount: z.number(),
        confidence: z.number().min(0).max(1),
      })
    ),
    calibration_summary: z.string(),
  }),
};

// ── Module 05: Gestoría Agent ──

export const GESTORIA_DAILY_ALERTS = {
  task: "gestoria_daily_alerts" as const,
  version: "1.0",
  system:
    `You are a Spanish fiscal advisor assistant for gestoría firms. ` +
    `Generate prioritized fiscal alerts based on the Spanish tax calendar and company data.\n\n` +
    `Hardcoded deadlines (Spain):\n` +
    `- Modelo 303/111/115 trimestral: 20 Apr (T1), 20 Jul (T2), 20 Oct (T3), 30 Jan (T4)\n` +
    `- Modelo 200 (IS): 25 Jul\n` +
    `- Modelo 347: 28 Feb\n` +
    `- Modelo 390: 30 Jan\n\n` +
    `Priority levels:\n` +
    `- urgent: deadline ≤5 days away\n` +
    `- high: deadline ≤15 days away\n` +
    `- normal: deadline ≤30 days away\n` +
    `- info: informational, no deadline pressure\n\n` +
    `Respond with ONLY valid JSON matching the requested schema. No markdown.`,
  buildUser: (data: {
    companies: Array<{ name: string; cif: string; companyType: string; pendingModels: string[] }>;
    currentDate: string;
    upcomingDeadlines: Array<{ model: string; period: string; dueDate: string }>;
    pendingDocs: number;
    overdueItems: number;
  }) =>
    `Generate fiscal alerts for this gestoría portfolio.\n\n` +
    `<company_data>\n${JSON.stringify(data.companies, null, 2)}\n</company_data>\n\n` +
    `<fiscal_calendar>\nCurrent date: ${data.currentDate}\nUpcoming deadlines:\n${JSON.stringify(data.upcomingDeadlines, null, 2)}\n</fiscal_calendar>\n\n` +
    `<pending_items>\nPending documents: ${data.pendingDocs}\nOverdue items: ${data.overdueItems}\n</pending_items>\n\n` +
    `Return JSON array of alerts: [{ priority: "urgent"|"high"|"normal"|"info", title: string, description: string, dueDate: string|null, fiscalRef: string|null, companyName: string|null }]`,
  schema: z.array(
    z.object({
      priority: z.enum(["urgent", "high", "normal", "info"]),
      title: z.string(),
      description: z.string(),
      dueDate: z.string().nullable(),
      fiscalRef: z.string().nullable(),
      companyName: z.string().nullable(),
    })
  ),
};

export const GESTORIA_REVIEW_DRAFT = {
  task: "gestoria_review_draft" as const,
  version: "1.0",
  system:
    `You are a Spanish tax expert reviewing fiscal model drafts (303/111/115). ` +
    `Check calculations: base × rate = cuota. Compare with prior period. ` +
    `Flag discrepancies, missing data, or unusual variations (>20% change).\n\n` +
    `Respond with ONLY valid JSON matching the requested schema. No markdown.`,
  buildUser: (data: {
    model: string;
    period: string;
    companyName: string;
    currentDraft: Record<string, unknown>;
    priorPeriod: Record<string, unknown> | null;
  }) =>
    `Review this fiscal draft.\n\n` +
    `<fiscal_draft>\nModel: ${data.model}\nPeriod: ${data.period}\nCompany: ${data.companyName}\n` +
    `Current: ${JSON.stringify(data.currentDraft, null, 2)}\n</fiscal_draft>\n\n` +
    `<prior_period>\n${data.priorPeriod ? JSON.stringify(data.priorPeriod, null, 2) : "No prior period data"}\n</prior_period>\n\n` +
    `Return JSON: { status: "ok"|"warning"|"error", discrepancies: [{ field: string, expected: number|null, actual: number|null, severity: "error"|"warning"|"info", message: string }], summary: string, priorComparison: { changed: boolean, percentChange: number|null, note: string|null } }`,
  schema: z.object({
    status: z.enum(["ok", "warning", "error"]),
    discrepancies: z.array(
      z.object({
        field: z.string(),
        expected: z.number().nullable(),
        actual: z.number().nullable(),
        severity: z.enum(["error", "warning", "info"]),
        message: z.string(),
      })
    ),
    summary: z.string(),
    priorComparison: z.object({
      changed: z.boolean(),
      percentChange: z.number().nullable(),
      note: z.string().nullable(),
    }),
  }),
};

export const GESTORIA_PROCESS_UPLOAD = {
  task: "gestoria_process_upload" as const,
  version: "1.0",
  system:
    `You are a document classifier for Spanish accounting firms. ` +
    `Classify uploaded documents by type and extract key metadata.\n\n` +
    `Document types: modelo_303, modelo_111, modelo_115, modelo_200, modelo_347, ` +
    `nomina, factura, escritura, contrato, certificado_retencion, recibo, extracto_bancario, otro.\n\n` +
    `Respond with ONLY valid JSON matching the requested schema. No markdown.`,
  buildUser: (data: { filename: string; contentPreview?: string }) =>
    `Classify this uploaded document.\n\n` +
    `<document>\nFilename: ${data.filename}\n` +
    `${data.contentPreview ? `Preview: ${data.contentPreview}\n` : ""}` +
    `</document>\n\n` +
    `Return JSON: { documentType: string, period: string|null, keyAmounts: { base: number|null, cuota: number|null, total: number|null }, completeness: "complete"|"partial"|"unknown", confidence: number (0-1), notes: string|null }`,
  schema: z.object({
    documentType: z.string(),
    period: z.string().nullable(),
    keyAmounts: z.object({
      base: z.number().nullable(),
      cuota: z.number().nullable(),
      total: z.number().nullable(),
    }),
    completeness: z.enum(["complete", "partial", "unknown"]),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable(),
  }),
};

// ── Module 06: Debt Analysis ──

export const ANALYZE_DEBT_POSITION = {
  task: "analyze_debt_position" as const,
  version: "1.0",
  system: "TODO: Implement in debt analysis module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};
