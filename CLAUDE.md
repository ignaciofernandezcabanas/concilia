# Concilia — Technical Reference

Concilia es una plataforma de conciliación bancaria automatizada con agente AI para controllers financieros de PYMEs españolas. Conecta un ERP (Holded) con movimientos bancarios, concilia transacciones automáticamente usando matching determinístico + LLM, y genera reportes financieros adaptados al Plan General Contable español (PGC 2007).

## Tech Stack

- **Framework**: Next.js 14 (App Router), TypeScript strict
- **ORM**: Prisma 7 con `@prisma/adapter-pg`
- **DB**: Supabase (PostgreSQL managed)
- **Auth**: Supabase Auth (email + password + OAuth Google/Microsoft)
- **AI**: Anthropic API — Haiku (NLP simple), Sonnet (razonamiento financiero), Opus (síntesis compleja)
- **Fuzzy matching**: Fuse.js
- **Validation**: Zod
- **Styling**: Tailwind CSS
- **Cron**: Upstash QStash (o CRON_SECRET para dev)
- **Storage**: Google Drive / OneDrive (abstracción unificada en `lib/storage/`)
- **Encryption**: AES-256-GCM para credenciales (`lib/crypto.ts`)
- **FX Rates**: ECB Statistical Data Warehouse API (31 divisas)

## Estructura de Carpetas

```
app/
  (app)/                    # Pages behind auth (AppShell layout)
    page.tsx                # Dashboard (briefing + 6 KPIs + acciones rápidas)
    conciliacion/           # Bandeja de conciliación
    seguimientos/           # Inquiries: seguimiento de emails y documentos
    facturas/               # Invoices (import PDF, view, delete)
    movimientos/            # Bank transactions (import CSV/N43, delete)
    asientos/               # Journal entries (crear, aprobar, revertir)
    plan-cuentas/           # Chart of accounts + libro mayor + sumas y saldos
    activos/                # Fixed assets (registro, amortización)
    periodificaciones/      # Recurring accruals (periodificaciones recurrentes)
    balance/                # Balance sheet (PGC)
    pyg/                    # P&L (PGC) con comparativas presupuesto/año anterior
    cashflow/               # Cash flow (treasury + EFE + WC bridge)
    tesoreria/              # Treasury forecast (13 semanas, gráfico SVG)
    cuentas-cobrar/         # Aging AR/AP (5 buckets, DSO/DPO, impagados)
    intercompania/          # Intercompany operations (confirmar/eliminar)
    consolidado/            # Consolidated reports (PyG/Balance multi-sociedad)
    inversiones/            # Investment portfolio (participaciones, préstamos)
    fiscal/                 # Fiscal: IVA, retenciones, reconciliación fiscal
    notificaciones/         # Notifications (17+ tipos)
    reglas/                 # Matching rules + NL creation
    ajustes/                # Settings: users, company, integrations, sociedades, periodos
      automatizacion/       # AI agent config + learning metrics
      sociedades/           # Multi-company management + consolidation setup
    onboarding/             # Onboarding v3 (individual vs grupo)
  login/                    # Login page (email + OAuth)
  auth/callback/            # OAuth callback handler
  api/                      # 84 endpoints

lib/
  ai/                       # AI orchestration
    model-router.ts         # callAI(), callAIJson(), callAIWithDocument()
    prompt-registry.ts      # Todos los prompts centralizados con XML tags
    confidence-engine.ts    # 16 categorías, scoring puro (sin side effects)
    confidence-calibrator.ts # Ajustes persistidos en DB (ConfidenceAdjustment)
    cascade.ts              # Classification cascade: rules → Haiku → Sonnet → unresolved
    context-retriever.ts    # Fetch decisiones previas relevantes por IBAN/concepto/patrón
    daily-agent.ts          # Orquestador diario: 11 steps por organización
    anomaly-detector.ts     # Detección de anomalías por z-score (>2σ)
    briefing.ts             # Briefing diario (Opus)
    close-proposal.ts       # Propuesta de cierre mensual (Opus)
    inquiry-drafter.ts      # Redacción de emails de solicitud de documentos (Sonnet)
    inquiry-replier.ts      # Respuestas contextuales a emails recibidos (Sonnet)
    rate-limiter.ts         # Max 5 concurrent LLM calls + circuit breaker
    client.ts               # Anthropic SDK singleton
  reconciliation/
    engine.ts               # Pipeline de conciliación (5 fases: 0+1-4), recibe db: ScopedPrisma
    resolver.ts             # Resolver unificado (16 acciones) en $transaction
    invoice-payments.ts     # Actualizador de status de pago
    decision-tracker.ts     # Feedback loop: registra decisiones del controller
    detectors/              # Internal, duplicate, return, financial, intercompany, investment, payroll
    matchers/               # Exact (FX-aware), grouped, fuzzy (FX-aware), LLM
    classifiers/            # Rule-based, LLM-based
    prioritizer.ts          # URGENT / DECISION / CONFIRMATION / ROUTINE
    explainer.ts            # Explicaciones para la bandeja (Haiku)
  reports/                  # Generadores (todos reciben db: ScopedPrisma)
    pyg-generator.ts        # P&L con columnas comparativas (presupuesto, año anterior, mes anterior)
    balance-generator.ts    # Balance de Situación
    cashflow-generator.ts   # EFE formal + tesorería directa + bloque B inversiones
    forecast-generator.ts   # Previsión de tesorería 13 semanas
    wc-bridge.ts            # Working Capital Bridge (waterfall)
    vat-generator.ts        # Cálculo teórico IVA (extraído de fiscal)
    vat-reconciliation.ts   # Reconciliación IVA teórico vs banco
    withholding-reconciliation.ts # Reconciliación retenciones vs banco
    reconciliation-report.ts
    exporter.ts
  accounting/               # Módulos contables
    depreciation.ts         # Amortización mensual automática
    accruals.ts             # Periodificaciones recurrentes (auto-reverse)
    deferred-entries.ts     # Anticipos (registro + vinculación con facturas)
    bad-debt.ts             # Insolvencias (criterio fiscal español: 6 meses + reclamación)
    payroll-verification.ts # Verificación mensual de nóminas
  fx/                       # Multi-divisa
    exchange-rate.ts        # ECB API, cache in-memory, 31 divisas, conversión EUR
  email/                    # Email sending + response monitoring
    sender.ts               # Abstracción Gmail/Outlook para envío
    response-monitor.ts     # Monitoriza respuestas a inquiries + evalúa con AI
    response-evaluator.ts   # 3 fases: adjuntos (Haiku) → texto (Sonnet) → decisión (reglas)
  holded/                   # Holded API client + sync modules
  bank/                     # Concept parser (Haiku), Norma43 parser
  invoices/                 # PDF extractor (Haiku), mailbox import, Drive uploader, Excel import
  storage/                  # Google Drive + OneDrive + Gmail + Outlook abstraction
  auth/                     # withAuth, permissions, cron-guard, rate-limit
  utils/                    # audit, errorResponse, period-guard (soft close), pagination, validation
  db.ts                     # Prisma client singleton
  db-scoped.ts              # getScopedDb(companyId), getGroupDb(companyIds)

components/                 # 17 React components: Sidebar, ContextSwitcher, ConfidenceBar, InlineChart...
hooks/useApi.ts             # useFetch, useInvoices, useTransactions...
prisma/schema.prisma        # 41 modelos, 53 enums
__tests__/                  # 61 archivos, 508 tests
```

## Setup Local

```bash
cp .env.example .env   # Fill in Supabase, Anthropic keys
npm install
npx prisma migrate dev # Apply migrations (creates tables + _prisma_migrations)
npx prisma db seed     # PGC accounts + datos demo
npm run dev
```

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

- **Trigger**: push to `main` + PRs to `main`
- **Steps**: `npm ci` → `prisma generate` → `tsc --noEmit` → `lint` → `test` → `build` (build only on push to main)
- **Node**: 22 (LTS)
- **Pre-commit**: Husky + lint-staged (prettier + eslint --fix)
- **No GitHub secrets required** — all env vars are build-time placeholders.

## Convenciones y Patrones

### Scoped DB (CRÍTICO)

Todos los endpoints con `withAuth` usan `ctx.db` (ScopedPrisma), que auto-inyecta `companyId` en todas las queries.

```typescript
// ✅ CORRECTO
export const GET = withAuth(async (req, ctx) => {
  const db = ctx.db;
  const invoices = await db.invoice.findMany({ where: { status: "PENDING" } });
});

// ❌ INCORRECTO — nunca importar prisma en endpoints
import { prisma } from "@/lib/db"; // PROHIBIDO excepto GLOBAL-PRISMA
```

**SCOPED_MODELS** (28 modelos auto-filtrados por companyId):
`company, user, account, ownBankAccount, contact, invoice, bankTransaction, reconciliation, matchingRule, categoryThreshold, integration, syncLog, archiveLog, notification, auditLog, accountingPeriod, journalEntry, fixedAsset, budget, confidenceAdjustment, controllerDecision, learnedPattern, thresholdCalibration, inquiry, investment, recurringAccrual, deferredEntry, badDebtTracker, exchangeRateDifference`

**NO scoped** (sin companyId): InvoiceLine, BudgetLine, JournalEntryLine, BankTransactionClassification, DuplicateGroup, Payment, CompanyScope, InvestmentTransaction.

**NO scoped** (organizationId): IntercompanyLink, AgentRun.

### Error Handling

- Todos los POST/PUT/DELETE validan input con **Zod** (`schema.safeParse(body)`)
- Todos los catch usan **errorResponse()** (`import { errorResponse } from "@/lib/utils/error-response"`)
- Producción nunca expone `err.message`

### AI Calls

```typescript
// ✅ Siempre via model-router
import { callAI, callAIJson } from "@/lib/ai/model-router";
const result = await callAIJson(
  "classify_quick",
  PROMPT.system,
  PROMPT.buildUser(data),
  PROMPT.schema
);

// ❌ Nunca SDK directamente (solo en model-router.ts y client.ts)
```

### Prompts — XML Tags (seguridad)

Datos financieros del usuario van SIEMPRE entre XML tags:

```
<bank_transaction>...</bank_transaction>
<pending_invoices>...</pending_invoices>
<company_data>...</company_data>
<controller_decisions>...</controller_decisions>
```

### GLOBAL-PRISMA (11 excepciones)

Archivos que usan `prisma` global con `// GLOBAL-PRISMA: <razón>`:

- `lib/auth/middleware.ts` — user lookup before company scoping
- `lib/reconciliation/resolver.ts` — $transaction requires raw Prisma
- `lib/reconciliation/detectors/intercompany-detector.ts` — cross-company lookup
- `lib/ai/daily-agent.ts` — orchestrator creates scoped dbs
- `app/api/auth/context/route.ts` — no company context yet
- `app/api/onboarding/route.ts`, `add-company/route.ts` — creates new Org/Company
- `app/api/cron/*` (4 archivos), `app/api/sync/holded/route.ts` — cron

## AI Architecture

### Model Router (`lib/ai/model-router.ts`)

| Modelo | Tareas                                                                                                                                                                             | Max tokens |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Haiku  | parse_concept, extract_invoice_pdf, explain_bandeja, classify_quick, classify_email_attachment, parse_clarification_reply                                                          | 150-300    |
| Sonnet | match_llm, classify_llm, parse_rule_nl, draft_reminder, explain_anomaly, treasury_advice, draft_inquiry, draft_clarification, classify_match_difference, classify_investment_capex | 500-1200   |
| Opus   | daily_briefing, weekly_briefing, close_proposal, risk_analysis                                                                                                                     | 800-2000   |

### Classification Cascade (`lib/ai/cascade.ts`)

1. **Determinístico** (reglas) → gratis, instantáneo
2. **Haiku** (classify_quick) → barato, sin CoT
3. **Sonnet** (classify_llm) → caro, CoT 5 pasos
4. **Unresolved** → bandeja

Short-circuit: si un nivel resuelve, no se ejecutan los siguientes.

### Confidence Engine (`lib/ai/confidence-engine.ts`)

16 categorías. Score = `(base + historical) × systemChecks + materiality + persistedAdjustment`. Clamped 0-1.

**NUNCA auto-ejecutan**: `periodification`, `manual_journal`.

System checks para LLM outputs: `account_exists`, `group_coherent`, `amount_in_range`, `concept_similar`. Multiplicador: 0 fallos → 1.0, 1 → 0.85, 2 → 0.70, 3+ → 0.50.

### Context Retriever (`lib/ai/context-retriever.ts`)

Inyecta decisiones previas del controller en los prompts LLM:

1. Mismo IBAN → ControllerDecision
2. Concepto similar → Fuse.js threshold 0.5
3. Patrones activos → LearnedPattern (ACTIVE_SUPERVISED/PROMOTED)

### Feedback Loop (cerrado)

```
Controller action → trackControllerDecision → calibrateFromDecision
→ ConfidenceAdjustment persisted → calculateConfidence reads it
→ Afecta futuras decisiones de auto-ejecución
```

## Daily Agent (`lib/ai/daily-agent.ts`)

11 steps por organización (cada uno en try/catch):

**Per-company:** sync, engine, auto_entries (amortización + accruals + deferred matches), intercompany, provisions, inquiry_followup, reminders.

**Group-level:** treasury (forecast + alertas), anomalies (z-score >2σ), fiscal (calendario español + reconciliación IVA/retenciones), close_proposal (días 1-3), briefing (Opus).

**Rate limits:** max 1 run/org/día, 20 LLM calls/company, 20 notificaciones/run.

## Motor de Conciliación (5 fases)

0. **Investment/CAPEX** — detector determinístico, confidence 0.0 forzado, NUNCA auto-aprueba
   - También detecta: payroll (SALARY, SS, IRPF)
1. **Detectors** — internal transfer, intercompany, duplicate, return, financial, credit note
2. **Matchers** — exact (FX-aware, 2% cross-currency) → partial → grouped → learned patterns → fuzzy (FX-aware, 7% cross-currency) → LLM
3. **Classifiers** — rule-based → cascade (Haiku → Sonnet) → unresolved
4. **Priority** — URGENT / DECISION / CONFIRMATION / ROUTINE

Auto-aprobación: `confidence >= categoryThreshold AND amount <= materialityThreshold`

16 acciones del resolver: approve, reject, investigate, manual_match (con DifferenceType + aclaración por email), classify, mark_internal, mark_intercompany, mark_duplicate, mark_legitimate, mark_return, ignore, split_financial, register_fixed_asset, register_investment, register_advance.

## 22 Escenarios de Conciliación

1-18. Escenarios operativos (cobros, pagos, parciales, agrupados, diferencias, devoluciones, duplicados, intercompañía, notas de crédito, ingresos no identificados)

19. **CAPEX_ACQUISITION / CAPEX_DISPOSAL** — compra/venta de inmovilizado
20. **INVESTMENT_FINANCIAL** — participaciones, préstamos, dividendos
21. **PAYROLL_PAYMENT** — nóminas, SS, IRPF (detectado, no auto-aprobado)
22. **MATCH_WITH_DIFFERENCE** — match manual con diferencia de importe + tipos (descuento, comisión, retención, FX, anticipo, aclaración por email)

## Contabilidad

- **Asientos** (JournalEntry): DRAFT → POSTED → REVERSED. Balance validado.
- **Activos fijos** (FixedAsset): depreciación lineal automática, 3 cuentas PGC.
- **Periodificaciones** (RecurringAccrual): devengos recurrentes (mensual/trimestral/anual), auto-reversión al vincular factura.
- **Anticipos** (DeferredEntry): anticipos de clientes (438) y a proveedores (407), vinculación automática con facturas.
- **Insolvencias** (BadDebtTracker): criterio fiscal español — 6 meses + reclamación para deducibilidad. Provisión 694/490.
- **Presupuestos** (Budget): por cuenta y mes, DRAFT → APPROVED → CLOSED.
- **Periodos** (AccountingPeriod): OPEN → SOFT_CLOSED → CLOSED → LOCKED. Soft close bloquea escrituras manuales, permite auto-entries.

## Reconciliaciones Fiscales

- **IVA** (vat-reconciliation.ts): compara IVA teórico (facturas) vs pagos reales a AEAT en banco. Detecta: TIMING, AMOUNT_MISMATCH, MISSING_PAYMENT.
- **Retenciones** (withholding-reconciliation.ts): compara retenciones calculadas (modelo 111/115) vs pagos a AEAT. Mismo patrón.

## Multi-divisa

31 divisas soportadas (ECB daily rates). Tipos de cambio cacheados por día. Diferencias de cambio: 668 (negativas) / 768 (positivas). Matchers FX-aware: 2% tolerancia exact, 7% fuzzy para cross-currency.

## Agente de Seguimiento (Inquiries)

Sistema de solicitud de documentos por email:

1. Motor detecta item sin factura → genera borrador de email (Sonnet)
2. Controller revisa y aprueba → se envía desde buzón dedicado
3. Response monitor busca respuestas en buzón → evaluador (3 fases: adjuntos Haiku + texto Sonnet + decisión reglas)
4. 13 acciones posibles: CLOSE_RESOLVED, REPLY_REQUEST_DOCUMENT, WAIT_PROMISED, ESCALATE_DISPUTE, etc.
5. Follow-ups automáticos con escalado (3→5→7 días)

**El AI NUNCA envía emails automáticamente.** Siempre requiere aprobación del controller.

## Multi-tenant

```
Organization → Company → User (con Membership + CompanyScope)
```

ContextSwitcher en sidebar. Vista consolidada (read-only) para OWNER/ADMIN. Detección intercompañía automática. Gestión de sociedades en /ajustes/sociedades con métodos de consolidación (FULL, EQUITY, PROPORTIONAL).

## Seguridad

- **Scoped DB**: 28 modelos auto-filtrados. Imposible acceder a datos de otra empresa.
- **HTTP rate limiting**: read 100/min, write 30/min, auth 5/min, engine 3/min.
- **LLM rate limiting**: max 5 concurrent, circuit breaker 3 errores → 60s.
- **Prompt injection**: datos en XML tags + Zod schemas + system checks.
- **AES-256-GCM**: credenciales encriptadas. Backward compatible.
- **Security headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.

## Decisiones de Diseño

- **Scoped DB over manual filters**: `ctx.db` inyecta companyId automáticamente.
- **LLM como último recurso**: deterministic → rules → Haiku → Sonnet.
- **Doble umbral**: materialityThreshold + materialityMinor. Conservador.
- **Single resolver**: TODA la lógica en `resolver.ts` dentro de `$transaction`.
- **Feedback loop cerrado**: cada decisión calibra la confianza futura.
- **GLOBAL-PRISMA documentado**: 11 excepciones comentadas.
- **Cascade**: clasificar con lo más barato, escalar si necesario.
- **AI nunca auto-aprueba**: periodificaciones, asientos manuales, cierre, intercompañía nueva, CAPEX, inversiones.
- **Soft close**: estado intermedio para reporting provisional sin bloquear auto-entries.
- **Criterio fiscal español**: insolvencias requieren 6 meses + reclamación para deducibilidad.
- **Multi-divisa conservador**: matchers con tolerancia FX separada, diferencias siempre a 668/768.

## Escenarios 19-22

### Escenario 19: CAPEX_ACQUISITION / CAPEX_DISPOSAL

- **Detector**: `detectors/investment-detector.ts` fase 0 del engine
- **Priority**: siempre DECISION (nunca ROUTINE, nunca CONFIRMATION)
- **Confidence**: forzado a 0.0 → nunca auto-aprueba
- **Acción resolver**: `register_fixed_asset`
- **Documento requerido**: Factura proveedor o contrato leasing
- **Cuenta PGC**: Grupo 21x (inferred) o 206 (intangible)

### Escenario 20: INVESTMENT_FINANCIAL

- **Detector**: `detectors/investment-detector.ts` fase 0 del engine
- **Priority**: siempre DECISION
- **Confidence**: forzado a 0.0
- **Acción resolver**: `register_investment`
- **Documentos**: SPA, escritura, contrato préstamo, certificado dividendo
- **Cuentas PGC**: 240/250/252 (debe) / 572 (haber); 760/761 (dividendos/intereses)

### Escenario 21: PAYROLL

- **Detector**: `detectors/payroll-detector.ts` fase 0 del engine
- **Tipos**: SALARY (640), SS_COMPANY (642), SS_EMPLOYEE (476), IRPF (4751)
- **Verificación mensual**: payroll-verification.ts comprueba que salary + SS + IRPF están presentes

### Escenario 22: MATCH_WITH_DIFFERENCE

- **DifferenceType**: EARLY_PAYMENT_DISCOUNT (706), BANK_COMMISSION (626), WITHHOLDING_TAX (473), PARTIAL_WRITE_OFF (650), FX_DIFFERENCE (668/768), OVERPAYMENT_ADVANCE (438), PENDING_CREDIT_NOTE, NEGOTIATED_ADJUSTMENT (706), REQUEST_CLARIFICATION (→ inquiry)
- Auto-justify < 5€ como 669

### Regla invariante

CAPEX e inversiones financieras NUNCA entran en auto-aprobación. NUNCA en batch-resolve. SIEMPRE requieren decisión del controller.
