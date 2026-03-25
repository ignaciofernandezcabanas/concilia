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
  system: "TODO: Implement in contacts agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const IMPORT_CONTACTS_FILE = {
  task: "import_contacts_file" as const,
  version: "1.0",
  system: "TODO: Implement in contacts agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const ENRICH_CONTACT_FROM_HISTORY = {
  task: "enrich_contact_from_history" as const,
  version: "1.0",
  system: "TODO: Implement in contacts agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const DEDUPLICATE_CONTACTS = {
  task: "deduplicate_contacts" as const,
  version: "1.0",
  system: "TODO: Implement in contacts agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

// ── Module 02: Onboarding Agent ──

export const ONBOARDING_INFERENCE = {
  task: "onboarding_inference" as const,
  version: "1.0",
  system: "TODO: Implement in onboarding agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const PARSE_HISTORICAL_FILE = {
  task: "parse_historical_file" as const,
  version: "1.0",
  system: "TODO: Implement in onboarding agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const CALIBRATE_ACCOUNT_PLAN = {
  task: "calibrate_account_plan" as const,
  version: "1.0",
  system: "TODO: Implement in onboarding agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

// ── Module 05: Gestoría Agent ──

export const GESTORIA_DAILY_ALERTS = {
  task: "gestoria_daily_alerts" as const,
  version: "1.0",
  system: "TODO: Implement in gestoría agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const GESTORIA_REVIEW_DRAFT = {
  task: "gestoria_review_draft" as const,
  version: "1.0",
  system: "TODO: Implement in gestoría agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

export const GESTORIA_PROCESS_UPLOAD = {
  task: "gestoria_process_upload" as const,
  version: "1.0",
  system: "TODO: Implement in gestoría agent module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};

// ── Module 06: Debt Analysis ──

export const ANALYZE_DEBT_POSITION = {
  task: "analyze_debt_position" as const,
  version: "1.0",
  system: "TODO: Implement in debt analysis module",
  buildUser: (data: Record<string, unknown>) => JSON.stringify(data),
};
