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

## Estructura de Carpetas

```
app/
  (app)/                    # Pages behind auth (AppShell layout)
    page.tsx                # Dashboard (briefing + 6 KPIs + acciones rápidas)
    conciliacion/           # Bandeja de conciliación
    facturas/               # Invoices (import PDF, view, delete)
    movimientos/            # Bank transactions (import CSV, delete)
    asientos/               # Journal entries (crear, aprobar, revertir)
    plan-cuentas/           # Chart of accounts + libro mayor + sumas y saldos
    activos/                # Fixed assets (registro, amortización)
    balance/                # Balance sheet (PGC)
    pyg/                    # P&L (PGC)
    cashflow/               # Cash flow (treasury + EFE)
    tesoreria/              # Treasury forecast (13 semanas, gráfico SVG)
    cuentas-cobrar/         # Aging AR/AP (5 buckets, DSO/DPO, riesgo)
    intercompania/          # Intercompany operations (confirmar/eliminar)
    consolidado/            # Consolidated reports (PyG/Balance multi-sociedad)
    notificaciones/         # Notifications (13 tipos)
    reglas/                 # Matching rules + NL creation
    ajustes/                # Settings: users, company, integrations
      automatizacion/       # AI agent config + learning metrics
    onboarding/             # Onboarding v3 (individual vs grupo)
  login/                    # Login page (email + OAuth)
  auth/callback/            # OAuth callback handler
  api/                      # 59 endpoints (ver tabla abajo)

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
    rate-limiter.ts         # Max 5 concurrent LLM calls + circuit breaker
    client.ts               # Anthropic SDK singleton
  reconciliation/
    engine.ts               # Pipeline de conciliación (4 fases), recibe db: ScopedPrisma
    resolver.ts             # Resolver unificado (12 acciones) en $transaction
    invoice-payments.ts     # Actualizador de status de pago
    decision-tracker.ts     # Feedback loop: registra decisiones del controller
    detectors/              # Internal, duplicate, return, financial, intercompany
    matchers/               # Exact, grouped, fuzzy, LLM
    classifiers/            # Rule-based, LLM-based
    prioritizer.ts          # URGENT / DECISION / CONFIRMATION / ROUTINE
    explainer.ts            # Explicaciones para la bandeja (Haiku)
  reports/                  # Generadores (todos reciben db: ScopedPrisma)
  accounting/               # depreciation.ts
  holded/                   # Holded API client + sync modules
  bank/                     # Concept parser (Haiku), Norma43 parser
  invoices/                 # PDF extractor (Haiku), mailbox import, Drive uploader
  storage/                  # Google Drive + OneDrive + Gmail + Outlook abstraction
  auth/                     # withAuth, permissions, cron-guard, rate-limit
  utils/                    # audit, errorResponse, period-guard, pagination, validation
  db.ts                     # Prisma client singleton
  db-scoped.ts              # getScopedDb(companyId), getGroupDb(companyIds)

components/                 # 16 React components: Sidebar, ContextSwitcher, ConfidenceBar, InlineChart...
hooks/useApi.ts             # useFetch, useInvoices, useTransactions...
prisma/schema.prisma        # 34 modelos, 33 enums
__tests__/                  # 30 archivos, 352 tests
```

## Setup Local

```bash
cp .env.example .env   # Fill in Supabase, Anthropic keys
npm install
npx prisma db push
npx prisma db seed     # PGC accounts + datos demo
npm run dev
```

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

**SCOPED_MODELS** (22 modelos auto-filtrados por companyId):
`company, user, account, ownBankAccount, contact, invoice, bankTransaction, reconciliation, matchingRule, categoryThreshold, integration, syncLog, archiveLog, notification, auditLog, accountingPeriod, journalEntry, fixedAsset, budget, confidenceAdjustment, controllerDecision, learnedPattern, thresholdCalibration`

**NO scoped** (sin companyId): InvoiceLine, BudgetLine, JournalEntryLine, BankTransactionClassification, DuplicateGroup, Payment, CompanyScope.

**NO scoped** (organizationId): IntercompanyLink, AgentRun.

### Error Handling

- Todos los POST/PUT/DELETE validan input con **Zod** (`schema.safeParse(body)`)
- Todos los catch usan **errorResponse()** (`import { errorResponse } from "@/lib/utils/error-response"`)
- Producción nunca expone `err.message`

### AI Calls

```typescript
// ✅ Siempre via model-router
import { callAI, callAIJson } from "@/lib/ai/model-router";
const result = await callAIJson("classify_quick", PROMPT.system, PROMPT.buildUser(data), PROMPT.schema);

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

| Modelo | Tareas | Max tokens |
|--------|--------|-----------|
| Haiku | parse_concept, extract_invoice_pdf, explain_bandeja, classify_quick | 150-300 |
| Sonnet | match_llm, classify_llm, parse_rule_nl, draft_reminder, explain_anomaly, treasury_advice | 500-1200 |
| Opus | daily_briefing, weekly_briefing, close_proposal, risk_analysis | 800-2000 |

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

**Per-company:** sync, engine, auto_entries (amortización), intercompany, provisions, reminders.

**Group-level:** treasury (forecast + alertas), anomalies (z-score >2σ), fiscal (calendario español), close_proposal (días 1-3), briefing (Opus).

**Rate limits:** max 1 run/org/día, 20 LLM calls/company, 20 notificaciones/run.

## Motor de Conciliación (4 fases)

1. **Detectors** — internal transfer, intercompany, duplicate, return, financial, credit note
2. **Matchers** — exact → partial → grouped → learned patterns → fuzzy → LLM
3. **Classifiers** — rule-based → cascade (Haiku → Sonnet) → unresolved
4. **Priority** — URGENT / DECISION / CONFIRMATION / ROUTINE

Auto-aprobación: `confidence >= categoryThreshold AND amount <= materialityThreshold`

12 acciones del resolver: approve, reject, investigate, manual_match, classify, mark_internal, mark_intercompany, mark_duplicate, mark_legitimate, mark_return, ignore, split_financial.

## 18 Escenarios de Conciliación

1. Cobro = factura emitida (exact match)
2. Cobro parcial
3. Cobro agrupado (multiple invoices)
4. Cobro con diferencia pequeña (commission, discount)
5-6. Pagos (symmetric to cobros)
7. Gasto recurrente sin match
8. Ingreso no identificado (ALWAYS bandeja)
9. Devolución de cobro
10. Devolución de pago
11. Transferencia interna
12. Posible duplicado (ALWAYS bandeja)
13. Factura emitida sin cobro, dentro de plazo
14. Factura vencida (overdue alert)
15-16. Facturas recibidas sin pago
17. Nota de crédito
18. Factura sin match (ALWAYS bandeja)

## Learning System

- **Reglas explícitas** (MatchingRule): controller crea, 100% confianza. Origin: MANUAL, INLINE, PROMOTED.
- **Patrones implícitos** (LearnedPattern): inferidos de decisiones. SUGGESTED → ACTIVE_SUPERVISED → PROMOTED/REJECTED.
- **NL creation**: controller escribe en español → Sonnet parsea (CoT 7 pasos) → confirmar.
- **Calibración**: ConfidenceAdjustment en DB. Error auto-execute → -0.10. Aprobado sin cambio → +0.01.

## Multi-tenant

```
Organization → Company → User (con Membership + CompanyScope)
```

ContextSwitcher en sidebar. Vista consolidada (read-only) para OWNER/ADMIN. Detección intercompañía automática.

## Contabilidad

- **Asientos** (JournalEntry): DRAFT → POSTED → REVERSED. Balance validado.
- **Activos fijos** (FixedAsset): depreciación lineal automática, 3 cuentas PGC.
- **Presupuestos** (Budget): por cuenta y mes, DRAFT → APPROVED → CLOSED.
- **Periodos** (AccountingPeriod): OPEN → CLOSED → LOCKED. Guard bloquea escrituras.

## Seguridad

- **Scoped DB**: 22 modelos auto-filtrados. Imposible acceder a datos de otra empresa.
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
- **AI nunca auto-aprueba**: periodificaciones, asientos manuales, cierre, intercompañía nueva.

## Endpoints (59 total)

### Core
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/invoices | CRUD facturas |
| POST | /api/invoices/import | Importar PDFs |
| GET/POST | /api/transactions | CRUD movimientos |
| POST | /api/transactions/import | Importar CSV |
| POST | /api/transactions/[id]/action | Acción sobre tx |
| POST | /api/reconciliation/run | Motor de conciliación |
| POST | /api/reconciliation/[id]/resolve | Resolver (12 acciones) |
| POST | /api/reconciliation/batch-resolve | Resolver múltiples |

### Reportes
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/reports/pyg | PyG |
| GET | /api/reports/balance | Balance |
| GET | /api/reports/cashflow | EFE / Tesorería |
| GET | /api/reports/forecast | Previsión tesorería |
| GET | /api/reports/aging | Antigüedad AR/AP |
| GET | /api/reports/ledger | Libro Mayor |
| GET | /api/reports/trial-balance | Sumas y Saldos |
| GET | /api/reports/consolidated | Consolidado |
| GET | /api/fiscal | IVA + Retenciones |

### Contabilidad
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/journal-entries | Asientos |
| POST/DELETE | /api/journal-entries/[id] | Post/reverse/delete |
| GET/POST | /api/fixed-assets | Activos fijos |
| GET/POST/PUT | /api/budgets | Presupuestos |

### AI Agent
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/cron/daily-agent | Agente diario (cron) |
| GET | /api/agent-runs | Historial runs |
| GET/PUT | /api/settings/automation | Config automatización |
| GET | /api/settings/automation/learning | Métricas aprendizaje |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PUT | /api/settings/accounts | Cuentas PGC |
| GET/PUT | /api/settings/periods | Periodos contables |
| POST | /api/settings/rules/parse | NL rule → structured |
| GET/PUT | /api/auth/context | Context switching |
