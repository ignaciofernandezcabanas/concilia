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
    seguimientos/           # Inquiries + AgentThreads: seguimiento de emails, documentos, follow-ups
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
    gestoria/               # Gestoría portal (alertas, borradores, subida, incidencias)
    notificaciones/         # Notifications (21+ tipos)
    reglas/                 # Matching rules + NL creation
    ajustes/                # Settings: users, company, integrations, sociedades, periodos
      automatizacion/       # AI agent config + learning metrics
      sociedades/           # Multi-company management + consolidation setup
    onboarding/             # Onboarding v3 (individual vs grupo)
    setup/                  # Onboarding wizard (8 steps, PGC inference, historical calibration)
  login/                    # Login page (email + OAuth)
  auth/callback/            # OAuth callback handler
  api/                      # 123 endpoints

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
    resolver.ts             # Resolver unificado (23+ acciones) en $transaction
    invoice-payments.ts     # Actualizador de status de pago
    decision-tracker.ts     # Feedback loop: registra decisiones del controller
    detectors/              # Internal, duplicate, return, financial, intercompany, investment, payroll, equity, financing
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
    fiscal-models.ts        # Modelos 303, 111, 115, 390 + calendario fiscal
    reconciliation-report.ts
    exporter.ts
  accounting/               # Módulos contables
    depreciation.ts         # Amortización mensual automática
    accruals.ts             # Periodificaciones recurrentes (auto-reverse)
    deferred-entries.ts     # Anticipos (registro + vinculación con facturas)
    bad-debt.ts             # Insolvencias (criterio fiscal español: 6 meses + reclamación)
    payroll-verification.ts # Verificación mensual de nóminas
    supporting-docs.ts      # Documentos soporte (10 tipos, JE DRAFT automático)
    equity.ts               # Regularización + distribución de resultados
    capital-adequacy.ts     # Check PN/capital per art. 363.1.e LSC
  fx/                       # Multi-divisa
    exchange-rate.ts        # ECB API, cache in-memory, 31 divisas, conversión EUR
  email/                    # Email sending + response monitoring
    sender.ts               # Abstracción Gmail/Outlook para envío
    response-monitor.ts     # Monitoriza respuestas a inquiries + evalúa con AI
    response-evaluator.ts   # 3 fases: adjuntos (Haiku) → texto (Sonnet) → decisión (reglas)
  contacts/                 # Contact management
    utils.ts                # normalizeNif, updateContactIfNewData
  fiscal/                   # Fiscal compliance
    fiscal-matrix.ts        # 7 company types → applicable fiscal models + calendar
  import/                   # Opening balance + file imports
    balance-parser.ts       # CSV parser (separator detection, Spanish amounts)
    account-mapper.ts       # 3-case mapping (exact, parent, needsReview)
    opening-balance.ts      # JE generator from trial balance CSV
  debt/                     # Debt management
    amortization-schedule.ts # French amortization system
    schedule-import.ts      # Schedule import + validation
  threads/                  # AgentThread management
    thread-manager.ts       # Lifecycle: create → draft → approve → send → follow-up → resolve
  holded/                   # Holded API client + sync modules
  bank/                     # Concept parser (Haiku), Norma43 parser
  invoices/                 # PDF extractor (Haiku), mailbox import, Drive uploader, Excel import
  storage/                  # Google Drive + OneDrive + Gmail + Outlook abstraction
  auth/                     # withAuth, permissions, cron-guard, rate-limit
  utils/                    # audit, errorResponse, period-guard (soft close), pagination, validation
  db.ts                     # Prisma client singleton
  db-scoped.ts              # getScopedDb(companyId), getGroupDb(companyIds)

components/                 # 18 React components: Sidebar, ContextSwitcher, ConfidenceBar, InlineChart...
hooks/useApi.ts             # useFetch, useInvoices, useTransactions...
prisma/schema.prisma        # 52 modelos, 68 enums
__tests__/                  # 77 archivos, 751 tests
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

### i18n de Enums (CRÍTICO)

Todos los valores de enum se traducen mediante `lib/i18n/enums.ts`. **Nunca renderizar valores de enum directamente en componentes (.tsx).**

```typescript
// ✅ CORRECTO
import { BANK_TRANSACTION_STATUS, t } from "@/lib/i18n/enums";
<span>{t(BANK_TRANSACTION_STATUS, transaction.status)}</span>

// ❌ INCORRECTO — nunca renderizar el valor raw del enum
<span>{transaction.status}</span> // Muestra "PENDING" en vez de "Pendiente"
```

Para nuevos enums: añadir al archivo centralizado **antes** de usarlos en UI. El mapa `LABELS` es el superset usado por `components/Badge.tsx`.

### Formateo de Fechas

Usar `lib/format.ts` para todos los formatos de fecha en la app:

- `formatPeriodLabel(date)` → selectores de período mensual: "Marzo de 2026" (capitalizado)
- `formatTableDate(date)` → fechas en celdas de tabla: "28/02/2026"
- `formatDate(date, "short")` → fechas cortas: "5 ene 2025"
- `formatDate(date, "long")` → fechas largas: "5 de enero de 2025"

```typescript
// ✅ CORRECTO
import { formatPeriodLabel } from "@/lib/format";
const label = formatPeriodLabel(currentMonth); // "Marzo de 2026"

// ❌ INCORRECTO — produce "marzo de 2026" sin capitalizar
date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
```

### Tablas

Todo contenedor de tabla usa `overflow-x-auto` (nunca `overflow-hidden`). Las tablas tienen `min-w-[...]` para no colapsar en pantallas pequeñas.

**Convenciones de tablas (Sprint 7):**

- **Texto truncado**: toda celda con clase `truncate` debe tener `title={fullText}` para tooltip nativo
- **Fechas relativas**: usar `formatRelativeWithTitle()` de `lib/format.ts` — devuelve `{ relative, absolute }`. Renderizar: `<span title={absolute}>{relative}</span>`
- **Fechas en celdas**: usar `formatTableDate()` de `lib/format.ts` → "28/02/2026" en una línea. Añadir `whitespace-nowrap` a la celda
- **Contactos**: nunca mostrar solo CIF sin nombre comercial. Formato: `"{nombre}"` o `"{nombre} ({cif})"`. Si no hay CIF, no renderizar placeholder "Sin CIF"
- **Columnas con ancho controlado**: usar `min-w-[Xpx]` o `max-w-[Xpx]` según el contenido
- **Tablas con distribución fija**: usar `table-fixed` en el `<table>` cuando las columnas tienen anchos explícitos

### Acciones Destructivas

Toda acción que elimine, cancele o revierta datos usa el componente `components/ui/ConfirmDialog.tsx`. **Nunca ejecutar acciones destructivas sin confirmación explícita.**

```typescript
// ✅ CORRECTO — dialog de confirmación
const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
// onClick → setPendingDelete(ids) → ConfirmDialog → onConfirm → ejecutar
<ConfirmDialog
  open={pendingDelete !== null}
  title="¿Eliminar?"
  description="Esta acción no se puede deshacer."
  confirmLabel="Eliminar"
  variant="destructive"
  onConfirm={executeDelete}
  onCancel={() => setPendingDelete(null)}
/>

// ❌ INCORRECTO — confirm() nativo o sin confirmación
if (!confirm("¿Seguro?")) return; // PROHIBIDO
await api.delete(...); // sin confirmación previa — PROHIBIDO
```

**Acciones con UNDO**: para acciones reversibles (ej. ignorar movimiento), usar Toast con acción "Deshacer" (ventana 10 segundos).

**Acciones que requieren confirmación:**

- Eliminar factura (individual y masiva)
- Cancelar documento soporte
- Ignorar movimiento bancario (con undo)
- _Añadir aquí cualquier nueva acción destructiva_

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

**SCOPED_MODELS** (33 modelos auto-filtrados por companyId):
`company, user, account, ownBankAccount, contact, invoice, bankTransaction, reconciliation, matchingRule, categoryThreshold, integration, syncLog, archiveLog, notification, auditLog, accountingPeriod, journalEntry, fixedAsset, budget, confidenceAdjustment, controllerDecision, learnedPattern, thresholdCalibration, inquiry, investment, recurringAccrual, deferredEntry, badDebtTracker, exchangeRateDifference, supportingDocument, debtInstrument, businessProfile, gestoriaConfig, fiscalObligation`

**NO scoped** (sin companyId): InvoiceLine, BudgetLine, JournalEntryLine, BankTransactionClassification, DuplicateGroup, Payment, CompanyScope, InvestmentTransaction, DebtScheduleEntry, DebtTransaction, DebtCovenant, ThreadMessage.

**NO scoped** (organizationId): IntercompanyLink, AgentRun, AgentThread, FollowUpConfig.

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

### Chat/Mensajes con Auto-scroll

Componentes con listas de mensajes (ej. seguimientos) usan `useRef` + `useEffect` para auto-scroll:

```typescript
const bottomRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);
// <div ref={bottomRef} /> al final de la lista
```

### onClick en Filas de Tabla

Siempre definir el handler dentro del `.map()` para evitar closures stale:

```typescript
{items.map((item) => (
  <tr key={item.id} onClick={() => setSelected(item)}>
```

### URL Search Params

Las páginas que aceptan `?search=` desde links externos leen el param con `useSearchParams()`:

```typescript
const searchParams = useSearchParams();
const [search, setSearch] = useState(searchParams.get("search") ?? "");
```

### Búsquedas Prisma

Todas las cláusulas `contains` sobre campos de texto en endpoints usan `mode: "insensitive"`:

```typescript
where: { concept: { contains: search, mode: "insensitive" } }
```

### Bandeja de Conciliación (`/conciliacion`)

- La query de `/api/transactions` incluye `reconciliations` con status `in: ["PROPOSED", "AUTO_APPROVED", "APPROVED"]` para obtener confidenceScore
- Columnas Prior., Tipo, Conf. leen de `BankTransaction.priority`, `BankTransaction.detectedType`, `reconciliations[0].confidenceScore`
- El `BankConnectionBanner` se oculta si hay cuentas bancarias activas O transacciones existentes (más robusto que solo comprobar Integration)

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

| Modelo | Tareas                                                                                                                                                                                                 | Max tokens |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Haiku  | parse_concept, extract_invoice_pdf, explain_bandeja, classify_quick, classify_email_attachment, parse_clarification_reply                                                                              | 150-300    |
| Sonnet | match_llm, classify_llm, parse_rule_nl, draft_reminder, explain_anomaly, treasury_advice, draft_inquiry, draft_clarification, classify_match_difference, classify_investment_capex, classify_financing | 500-1200   |
| Opus   | daily_briefing, weekly_briefing, close_proposal, risk_analysis                                                                                                                                         | 800-2000   |

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

**Per-company:** sync, engine, auto_entries (amortización + accruals + deferred matches), intercompany, provisions, inquiry_followup, debt_monitoring (overdue installments, covenant checks, reclassification proposals), reminders.

**Group-level:** treasury (forecast + alertas), anomalies (z-score >2σ), fiscal (calendario español + reconciliación IVA/retenciones), close_proposal (días 1-3), briefing (Opus).

**Rate limits:** max 1 run/org/día, 20 LLM calls/company, 20 notificaciones/run.

## Motor de Conciliación (5 fases)

0. **Investment/CAPEX/Equity** — detector determinístico, confidence 0.0 forzado, NUNCA auto-aprueba
   - También detecta: payroll (SALARY, SS, IRPF), equity (dividendos, ampliación capital, modelos fiscales, nóminas)
1. **Detectors** — internal transfer, intercompany, duplicate, return, financial, credit note, financing (debt)
2. **Matchers** — exact (FX-aware, 2% cross-currency) → partial → grouped → learned patterns → fuzzy (FX-aware, 7% cross-currency) → LLM
3. **Classifiers** — rule-based → cascade (Haiku → Sonnet) → unresolved
4. **Priority** — URGENT / DECISION / CONFIRMATION / ROUTINE

Auto-aprobación: `confidence >= categoryThreshold AND amount <= materialityThreshold`

23 acciones del resolver: approve, reject, investigate, manual_match (con DifferenceType + aclaración por email), classify, mark_internal, mark_intercompany, mark_duplicate, mark_legitimate, mark_return, ignore, split_financial, register_fixed_asset, register_investment, register_advance, match_debt_installment, match_debt_interest, record_debt_commission, record_debt_drawdown, record_debt_repayment, match_discount_advance, match_discount_settlement, match_lease_payment.

## 22 Escenarios de Conciliación

1-18. Escenarios operativos (cobros, pagos, parciales, agrupados, diferencias, devoluciones, duplicados, intercompañía, notas de crédito, ingresos no identificados)

19. **CAPEX_ACQUISITION / CAPEX_DISPOSAL** — compra/venta de inmovilizado
20. **INVESTMENT_FINANCIAL** — participaciones, préstamos, dividendos
21. **PAYROLL_PAYMENT** — nóminas, SS, IRPF (detectado, no auto-aprobado)
22. **MATCH_WITH_DIFFERENCE** — match manual con diferencia de importe + tipos (descuento, comisión, retención, FX, anticipo, aclaración por email)

## Contabilidad

- **Balance descuadrado**: `/balance` muestra banner sticky rojo antes de la tabla cuando `|Activo - (Pasivo+PN)| >= 0.01`, con enlace a `/conciliacion?filter=pending`. La validación existente al final de la página se mantiene.
- **Asientos** (JournalEntry): DRAFT → POSTED → REVERSED. Balance validado.
- **Activos fijos** (FixedAsset): depreciación lineal automática, 3 cuentas PGC.
- **Periodificaciones** (RecurringAccrual): devengos recurrentes (mensual/trimestral/anual), auto-reversión al vincular factura.
- **Anticipos** (DeferredEntry): anticipos de clientes (438) y a proveedores (407), vinculación automática con facturas.
- **Insolvencias** (BadDebtTracker): criterio fiscal español — 6 meses + reclamación para deducibilidad. Provisión 694/490.
- **Documentos soporte** (SupportingDocument): actas, escrituras, contratos, modelos fiscales, nóminas, pólizas, alquileres. Estado: PENDING_APPROVAL → POSTED → RECONCILED. Genera JE DRAFT con cuentas PGC por tipo. Matching automático con banco por importe + dirección (1% tolerancia, confidence 0.93).
- **Equity** (regularización + distribución + capital adequacy):
  - Regularización: cierre de cuentas grupo 6/7, resultado a 129 (beneficio credit, pérdida debit).
  - Distribución: reparto a 112 (reserva legal), 113 (voluntarias), 526 (dividendos), 120 (compensar pérdidas). Validaciones: sum = result, compensar pérdidas si 121 > 0, reserva legal >= 10% si < 20% capital, no dividendos si pérdida.
  - Capital adequacy: PN/capital ratio per art. 363.1.e LSC. CRITICAL <= 50%, MEDIUM <= 100%, INFO si reserva legal < 20%.
- **Presupuestos** (Budget): por cuenta y mes, DRAFT → APPROVED → CLOSED.
- **Periodos** (AccountingPeriod): OPEN → SOFT_CLOSED → CLOSED → LOCKED. Soft close bloquea escrituras manuales, permite auto-entries.

## Reconciliaciones Fiscales

- **IVA** (vat-reconciliation.ts): compara IVA teórico (facturas) vs pagos reales a AEAT en banco. Detecta: TIMING, AMOUNT_MISMATCH, MISSING_PAYMENT.
- **Retenciones** (withholding-reconciliation.ts): compara retenciones calculadas (modelo 111/115) vs pagos a AEAT. Mismo patrón.

## Módulo Fiscal Standalone (`lib/reports/fiscal-models.ts`)

- **Modelo 303**: IVA trimestral. Devengado (general 21%, reducido 10%, superreducido 4%) vs deducible interiores. Checks: CIF proveedor, tipos no estándar.
- **Modelo 111**: Retenciones trabajo + profesionales. Desde facturas recibidas con retención.
- **Modelo 115**: Retenciones alquileres. Filtra por cuenta 621 o descripción "alquiler".
- **Modelo 390**: Resumen anual IVA (agrega 4 trimestres de M303).
- **Calendario fiscal**: deadlines por año (T1-T4 para 303/111/115, IS julio, 390 enero siguiente).

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

- **Scoped DB**: 32 modelos auto-filtrados. Imposible acceder a datos de otra empresa.
- **HTTP rate limiting**: read 100/min, write 30/min, auth 5/min, engine 3/min.
- **LLM rate limiting**: max 5 concurrent, circuit breaker 3 errores → 60s.
- **Prompt injection**: datos en XML tags + Zod schemas + system checks.
- **AES-256-GCM**: credenciales encriptadas. Backward compatible.
- **Security headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.

## Opening Balance Import (optional)

Importa un CSV de sumas y saldos (trial balance) para generar un asiento de apertura.

**Modules:**

- `lib/import/balance-parser.ts` — CSV parser: separator detection, Spanish amounts, column detection
- `lib/import/account-mapper.ts` — 3-case mapping: exact match, parent match, needsReview
- `lib/import/opening-balance.ts` — JE generator: validates balance squares, creates DRAFT JE

**API:**

- `POST /api/import/opening-balance` — Upload CSV + periodDate → parse, map, generate JE
- `POST /api/import/resolve-accounts` — Resolve needsReview accounts with PGC mappings

**Schema:** `OpeningBalanceImport` model (scoped, unique per company). `Account` gains `isCustom`, `needsReview`, `mappedToPgcCode` fields.

**Rules:**

- Balance must square (gap < 1 EUR) to generate JE
- Duplicate opening JE per date is prevented
- Accounts with 0 balance are filtered out
- JE created as DRAFT (never auto-posted)

## Autonomous Follow-Up System (AgentThread)

Proactive follow-up threads managed by the AI agent across 8 scenarios:

1. **Overdue receivables** — escalation emails to debtors
2. **Duplicates** — confirm or dismiss with controller
3. **Supplier discrepancies** — request clarification on amount mismatches
4. **Fiscal documents** — request missing fiscal docs (modelos, certificados)
5. **Gestoría** — coordinate with external firm on deadlines
6. **Bank returns** — follow up on returned charges
7. **Unidentified advances** — identify origin of unexplained inflows
8. **Intercompany** — confirm cross-company transfers with counterparts

### Models

- **AgentThread**: scenario, status (OPEN/WAITING/RESOLVED/ESCALATED/EXPIRED), priority, auto-resolve rules, max follow-ups, supportingDocUrls
- **ThreadMessage**: role (AGENT/CONTROLLER/EXTERNAL), content, attachments, import-on-reply with controller approval
- **FollowUpConfig**: per-scenario configuration (intervals, max attempts, escalation rules)

### Thread Manager

Orchestrates the lifecycle: create thread → draft message → controller approval → send → monitor responses → follow-up cycle → auto-resolve or escalate. Integrates with daily-agent inquiry_followup step.

### Thread Documents

- `supportingDocUrls` on AgentThread for attaching evidence
- Attachment display in ThreadMessage UI
- Import-on-reply: when external party replies with document, agent proposes import pending controller approval

## Convenciones de Datos (Sprint 4)

### Invoice.description vs InvoiceLine.description

El modelo `Invoice` tiene un campo `description` (`String?`) pero para facturas importadas desde Holded suele estar vacío. La descripción real está en `InvoiceLine.description`. En la UI se muestra: `inv.description || inv.lines?.[0]?.description || "—"`. La columna se llama "Concepto", no "Descripción".

### Query de /facturas

La query GET `/api/invoices` siempre incluye:

```typescript
include: {
  contact: { select: { id: true, name: true, cif: true } },
  lines: { select: { description: true }, take: 1 },
  _count: { select: { reconciliations: true, payments: true } },
}
```

Incluye también un `aggregate` con `_sum: { totalAmount: true }` para mostrar totales al filtrar.

La query GET `/api/invoices/[id]` (detalle) incluye: `{ lines: true, payments: true, contact: true, reconciliations: true }`.

### Panel de detalle de facturas

`InvoiceDetailPanel` es un componente inline en `app/(app)/facturas/page.tsx`. Sigue el patrón visual de `ReconciliationPanel` (panel lateral derecho, 480px, cierre con X/Esc) pero es un componente independiente — no comparte código con ReconciliationPanel.

### Filtros de estado: siempre WHERE en Prisma

Todos los filtros de estado (facturas, documentos soporte, etc.) se aplican como `WHERE` en la query de Prisma, nunca filtrando arrays en el frontend. El dropdown envía el valor del enum directamente (ej. `PENDING`, no `"Pendiente"`).

### Counts de tabs con groupBy

Los contadores de tabs (ej. "Registrado (3)") se calculan con `groupBy` en la query GET inicial. Se retornan como `counts: { [status]: number }` en la respuesta de la API.

### api.patch en api-client

`lib/api-client.ts` expone `api.patch()` para peticiones PATCH autenticadas. Usar siempre `api.post/put/patch/delete` en vez de `fetch()` directo para garantizar el token de Supabase.

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

## Debt Module

### Modelos

- **DebtInstrument**: 7 tipos (TERM_LOAN, REVOLVING_CREDIT, DISCOUNT_LINE, CONFIRMING, FINANCE_LEASE, OVERDRAFT, GUARANTEE). Status: ACTIVE, MATURED, REFINANCED, DEFAULT.
- **DebtScheduleEntry**: Cuadro de amortización por instrumento. `matched` flag para conciliación.
- **DebtTransaction**: 13 tipos de transacción (DRAWDOWN, REPAYMENT, INSTALLMENT\_\*, COMMISSION, RECLASSIFICATION_LP_CP, etc.)
- **DebtCovenant**: 6 métricas (DEBT_TO_EBITDA, DSCR, CURRENT_RATIO, NET_WORTH, EQUITY_RATIO, LEVERAGE_RATIO). Test frequency configurable.

### Alertas de vencimiento (frontend)

La tabla de instrumentos en `/deuda` muestra badges de proximidad junto a `maturityDate`: < 0 días → rojo "Vencido", ≤ 30 días → rojo "Vence en Nd", ≤ 90 días → ámbar "Vence en Nd". Sin cambios en schema — lógica frontend con Date nativo.

### Financing Detector (`detectors/financing-detector.ts`)

- Fase 0 del engine, junto con investment-detector
- Detecta: cuotas de préstamo, comisiones bancarias, disposiciones de crédito, pagos de leasing, descuentos comerciales, avales
- Priority: siempre DECISION para nuevos instrumentos, CONFIRMATION para cuotas matched
- Crea propuesta de match con DebtScheduleEntry cuando detecta cuota coincidente

### Amortización

- **Sistema francés** (`lib/debt/amortization-schedule.ts`): cuota constante, carencia opcional
- **Import/validación** (`lib/debt/schedule-import.ts`): validación de sumas, cronología, totales

### Agent debt monitoring

- Step en daily-agent per-company: detecta cuotas vencidas no pagadas, evalúa covenants, propone reclasificación LP→CP al cierre

### API Endpoints (7)

| Method   | Path                                    | Description                     |
| -------- | --------------------------------------- | ------------------------------- |
| GET/POST | /api/debt-instruments                   | Listar/crear instrumentos       |
| GET/PUT  | /api/debt-instruments/[id]              | Detalle/actualizar instrumento  |
| POST     | /api/debt-instruments/[id]/schedule     | Regenerar/importar cuadro       |
| POST     | /api/debt-instruments/[id]/transactions | Registrar transacción manual    |
| POST     | /api/debt-instruments/[id]/reclassify   | Reclasificación LP→CP           |
| GET      | /api/debt-instruments/summary           | Posición de deuda consolidada   |
| GET      | /api/debt-instruments/covenants         | Covenants con estado compliance |

### Debt Position Report (`lib/reports/debt-position.ts`)

- Total debt (LP + CP), cash balance, net debt
- Available credit lines, weighted avg rate
- DSCR (Debt Service Coverage Ratio)
- Overdue installments, covenant compliance

## Pre-implementation Infrastructure (6 Agent Modules)

### New Models

- **BusinessProfile** (1:1 with Company): sector, actividad, canales, regimenIva, modeloIngreso, subplanPGC, modulosFiscales. Scoped.
- **GestoriaConfig** (1:1 with Company): gestoriaName, contactName, phone, email, accessLevel, manages. Scoped.

### Schema Changes (Existing Models)

- **Contact**: +typicalAmountAvg, irpfApplicable, irpfRateImplied, latePaymentRisk, enrichedAt, enrichmentConfidence
- **Company**: +needsBusinessProfile (default true), businessProfile relation, gestoriaConfig relation
- **LearnedPattern**: +source (default "controller") -- reused instead of creating RecurringPattern model

### AI Task Stubs (prompt-registry.ts + model-router.ts)

| Task                        | Model  | MaxTokens | Module        |
| --------------------------- | ------ | --------- | ------------- |
| detect_contact_from_email   | Haiku  | 200       | 01-Contacts   |
| import_contacts_file        | Haiku  | 300       | 01-Contacts   |
| enrich_contact_from_history | Sonnet | 500       | 01-Contacts   |
| deduplicate_contacts        | Sonnet | 400       | 01-Contacts   |
| onboarding_inference        | Sonnet | 1200      | 02-Onboarding |
| parse_historical_file       | Haiku  | 2000      | 02-Onboarding |
| calibrate_account_plan      | Sonnet | 1500      | 02-Onboarding |
| gestoria_daily_alerts       | Sonnet | 600       | 05-Gestoria   |
| gestoria_review_draft       | Sonnet | 500       | 05-Gestoria   |
| gestoria_process_upload     | Haiku  | 300       | 05-Gestoria   |
| analyze_debt_position       | Sonnet | 1000      | 06-Debt       |

### Mailbox: In-Reply-To Check

`lib/invoices/import-from-mailbox.ts` now checks `In-Reply-To` header against `clarificationEmailMessageId` before processing emails as invoices. Replies to clarifications skip the invoice pipeline.

### Contacts Agent (Module 01)

Three endpoints, one mailbox hook, four AI prompts.

**Endpoints:**

| Method | Path                      | Description                                        |
| ------ | ------------------------- | -------------------------------------------------- |
| POST   | /api/contacts/import      | Import CSV via AI parsing (Haiku). Dedup by NIF.   |
| POST   | /api/contacts/deduplicate | Deterministic merge (NIF) + AI proposals (Sonnet). |
| POST   | /api/contacts/enrich      | Infer payment conditions from tx history (Sonnet). |

**Mailbox hook** (`lib/invoices/import-from-mailbox.ts`): Creates basic contact from sender email before invoice processing. No AI call — enrichment done via `/enrich`.

**Prompts:** `DETECT_CONTACT_FROM_EMAIL` (Haiku), `IMPORT_CONTACTS_FILE` (Haiku), `ENRICH_CONTACT_FROM_HISTORY` (Sonnet), `DEDUPLICATE_CONTACTS` (Sonnet).

**Business rules:**

- NIF normalized (remove hyphens/dots/spaces, uppercase) before all dedup checks.
- Import fills empty fields on existing contacts, never overwrites.
- Dedup: same normalized NIF = auto-merge (canonical = most fields filled). No-NIF contacts → AI proposals for controller review.
- Enrich: min 3 bank movements required. Transaction lookup: contactId → IBAN → fuzzy name. Max 20 contacts per call.
- Utility functions in `lib/contacts/utils.ts`: `normalizeNif`, `updateContactIfNewData`.

### Design Decisions

- **LearnedPattern reused**: No separate RecurringPattern model. Added `source` field to distinguish controller vs agent-generated patterns.
- **Onboarding (Option B)**: `needsBusinessProfile` flag on Company triggers onboarding inference. BusinessProfile stores the inferred business context.
- **Debt analysis**: On-demand endpoint pattern (preserves LLM budget for 6 agent modules). analyze_debt_position is Sonnet-level.
- **SCOPED_MODELS**: businessProfile and gestoriaConfig added for consistency (both have companyId with @unique).

## Onboarding Agent + Historical Calibration

### Overview

Multi-step setup wizard (`/setup`) that infers PGC 2007 accounts, fiscal modules, and default counterparts from the company's business profile, then optionally calibrates with historical accounting data.

### Endpoints

| Method | Path                              | Description                                            |
| ------ | --------------------------------- | ------------------------------------------------------ |
| POST   | /api/setup/business-profile/infer | Infer PGC subplan from business profile (Sonnet)       |
| POST   | /api/setup/historical/process     | Parse historical files + calibrate plan (Haiku+Sonnet) |

### Prompts (3)

- **ONBOARDING_INFERENCE** (Sonnet, 1200 tok): Infers PGC accounts + fiscal modules + default counterparts from company form data. Only real PGC codes, fiscal modules with legal basis.
- **PARSE_HISTORICAL_FILE** (Haiku, 2000 tok): Parses CSV/Excel accounting files. Detects format (balance sumas saldos, libro diario, Holded/Sage/A3/generic).
- **CALIBRATE_ACCOUNT_PLAN** (Sonnet, 1500 tok): Compares inferred plan vs historical data. Confirms, adds, deactivates accounts. Flags anomalies (551, 170/520). Extracts recurring patterns (>=3 occurrences).

### Wizard Flow (8 steps)

1. Company data (name, NIF, forma jurídica)
2. Activity (sector, descripción, canales)
3. Fiscality (régimen IVA, retenciones IRPF, forma cobro)
4. Inference result (auto-calls /infer on entering step)
5. Historical file upload (optional, can skip)
6. Calibration result (auto-calls /process on entering step)
7. Integration links (redirect to /ajustes)
8. Summary + "Empezar" → redirects to dashboard

### SetupBanner

`components/SetupBanner.tsx` — Shown on dashboard when `Company.needsBusinessProfile = true`. Links to `/setup`.

### Calibration → LearnedPattern

Recurring patterns from historical calibration are stored as `LearnedPattern` entries with `type: "historical_calibration"`. These feed into the reconciliation engine's pattern matching phase.

## Gestoría Portal

Collaborative portal between controllers and external gestoría firms for fiscal compliance.

### Architecture

- **Fiscal Matrix** (`lib/fiscal/fiscal-matrix.ts`): Hardcoded mapping of 7 company types → applicable fiscal models (303, 111, 115, 200, 347, 349, 390, 130, 202). Includes Spanish fiscal calendar with all deadlines.
- **Access Check** (`lib/auth/gestoria-check.ts`): Helper to verify GestoriaConfig exists and access level is sufficient. Hierarchy: `subir_docs < reportes < completo`.
- **3 AI Prompts**: `GESTORIA_DAILY_ALERTS` (Sonnet), `GESTORIA_REVIEW_DRAFT` (Sonnet), `GESTORIA_PROCESS_UPLOAD` (Haiku).
- **Daily Agent Step**: `gestoria_sync` runs after fiscal step. Generates alerts for companies with GestoriaConfig, creates GESTORIA_ALERT notifications.

### Endpoints

| Method   | Path                                  | Description                   | Access Level |
| -------- | ------------------------------------- | ----------------------------- | ------------ |
| GET      | /api/gestoria/alerts                  | AI-generated fiscal alerts    | reportes     |
| GET      | /api/gestoria/drafts                  | List fiscal drafts by quarter | reportes     |
| GET      | /api/gestoria/drafts/[model]/[period] | AI review of specific draft   | reportes     |
| POST     | /api/gestoria/drafts/[model]/[period] | Approve draft                 | completo     |
| POST     | /api/gestoria/upload                  | Upload + classify document    | subir_docs   |
| GET/POST | /api/gestoria/incidents               | CRUD gestoría incidents       | subir_docs   |
| GET      | /api/gestoria/package/[period]        | Fiscal summary package (JSON) | reportes     |
| GET/PUT  | /api/gestoria/config                  | Gestoría configuration        | any          |

### Frontend

- **Portal page** (`app/(app)/gestoria/page.tsx`): 5 tabs (Alerts, Drafts, Upload, Incidents, Package). Summary cards with urgent alerts, ready drafts, open incidents.
- **Settings tab** (`app/(app)/ajustes/page.tsx` → Gestoría tab): Configure gestoría name, contact, email, phone, manages areas (fiscal/laboral/mercantil/contable), access level.
- **Sidebar**: "Gestoría" link in SISTEMA section.

### Notification Types

`GESTORIA_ALERT`, `GESTORIA_UPLOAD`, `GESTORIA_INCIDENT`, `GESTORIA_DRAFT_APPROVED`.

## Módulo Cuentas Bancarias

### Modelo OwnBankAccount (`prisma/schema.prisma`)

23 campos: `id`, `iban` (required, unique per company), `bankName?`, `alias?`, `isActive` (default true), `accountType` (BankAccountType enum), `connectionMethod` (default "FILE_IMPORT"), `pgcAccountCode?`, `lastFourDigits?`, `contractNumber?`, `detectionPattern?`, `creditLimit?`, `interestRate?`, `monthlyPayment?`, `startDate?`, `maturityDate?`, `paymentDay?`, `initialBalance?`, `initialBalanceDate?`, `currentBalance?`, `currentBalanceDate?`, `currency` (default "EUR"), `companyId`.

### BankAccountType Enum (7 valores)

`CHECKING`, `SAVINGS`, `CREDIT_LINE`, `LOAN`, `CREDIT_CARD`, `CONFIRMING`, `FACTORING`

### Auto-asignación de cuenta PGC (`lib/bank/detect-bank.ts`)

Función `suggestPGCAccount(type, existingCodes)` — prefijo por tipo + contador auto-incremental:

| Tipo        | Prefijo PGC | Cuenta PGC                                   |
| ----------- | ----------- | -------------------------------------------- |
| CHECKING    | 57200       | 572 — Bancos e instituciones de crédito      |
| SAVINGS     | 57100       | 571 — Caja, euros                            |
| CREDIT_LINE | 52010       | 5201 — Deudas a c/p por crédito dispuesto    |
| LOAN        | 17000       | 170 — Deudas a l/p con entidades de crédito  |
| CREDIT_CARD | 52660       | 5266 — Tarjetas de crédito                   |
| CONFIRMING  | 52130       | 5213 — Deudas por confirming                 |
| FACTORING   | 43100       | 431 — Clientes, efectos comerciales a cobrar |

### Detección de banco (`lib/bank/detect-bank.ts`)

`detectBankFromIBAN(iban)` — extrae código entidad (dígitos 5-8 del IBAN español) y devuelve nombre + BIC. 35 bancos españoles soportados.

### Conexión PSD2

Al seleccionar Open Banking, el flujo de callback está en `/api/integrations/bank/callback`. El formulario muestra texto informativo sobre la redirección bancaria.

### Motor de conciliación y OwnBankAccount

El motor usa `OwnBankAccount.iban` para detectar transferencias internas (`lib/reconciliation/detectors/internal-detector.ts`). Busca `iban` en todas las cuentas activas. Cualquier IBAN añadido (incluyendo el IBAN de cargos de Préstamo) queda automáticamente incluido en la detección.

### Endpoints API

| Method | Path                               | Description                | Permission        |
| ------ | ---------------------------------- | -------------------------- | ----------------- |
| GET    | /api/bank-accounts                 | Listar cuentas (agrupadas) | read:transactions |
| POST   | /api/bank-accounts                 | Crear cuenta               | manage:settings   |
| GET    | /api/bank-accounts/[id]            | Detalle cuenta             | read:transactions |
| PUT    | /api/bank-accounts/[id]            | Actualizar cuenta          | manage:settings   |
| POST   | /api/bank-accounts/[id]/deactivate | Desactivar                 | manage:settings   |
| POST   | /api/bank-accounts/[id]/reactivate | Reactivar                  | manage:settings   |
| GET    | /api/bank-accounts/detect-bank     | Detectar banco por IBAN    | read:transactions |

### Validación del formulario (Sprint 9)

Campos requeridos por tipo:

- **Todos**: alias
- **CHECKING, SAVINGS, CREDIT_LINE, CONFIRMING, FACTORING**: IBAN
- **CREDIT_CARD**: últimos 4 dígitos
- **LOAN, CREDIT_LINE, CONFIRMING, FACTORING**: límite de crédito, fecha de constitución
- **LOAN**: cuota mensual

Validación client-side antes de llamar al API. Error de IBAN duplicado (409) se muestra inline bajo el campo IBAN.

## Módulo Fiscal

### Cálculos de IVA

Los cálculos de IVA por período se centralizan en `lib/reports/vat-generator.ts` (`generateVatReport`). Tanto el Modelo 303 como el Resumen 390 usan la misma función — nunca duplicar la query. El 390 (`calculateModel390`) llama a `calculateModel303` para cada trimestre.

**vatRate en DB**: se almacena como decimal (0.21 = 21%). La función `groupByRate()` en `vat-generator.ts` normaliza automáticamente: si `vatRate > 0 && vatRate < 1`, lo multiplica por 100. Las condiciones de clasificación por tramo en `fiscal-models.ts` comparan contra enteros (21, 10, 4).

**Línea "Tipos no clasificados"** en el 303: catch-all que muestra la diferencia entre el total y la suma de los tres tramos estándar. Si aparece con importe > 0, hay vatRates fuera de los tramos estándar.

### Impuesto de Sociedades

Ajustes extracontables (gastos no deducibles, ingresos exentos) son campos editables que persisten en el modelo `FiscalAdjustment` (scoped, unique por company+year). La función `calculateModelIS(db, companyId, year)` lee los ajustes de DB.

**PATCH /api/reports/fiscal/is**: persiste los ajustes extracontables (upsert por companyId+year) y devuelve el IS recalculado. Permiso: `manage:settings`.

### Calendario fiscal

Interactivo: cada ítem es clickable y navega al tab correcto con el trimestre preseleccionado. El fiscal page lee `searchParams` al montar: `?tab=303&periodo=T1&ejercicio=2026`.

**Badges de urgencia** (5 niveles): vencido (rojo), urgente ≤5 días (rojo), ≤15 días (amarillo), ≤30 días (ámbar), pendiente (gris). Presentado (verde) override todos los niveles.

**Tracking de presentación**: `FiscalObligation` model (scoped, `@@unique([companyId, model, quarter, year])`). Campo `presentedAt: DateTime?`. Botón toggle en cada obligación del calendario. Endpoint: `GET/PATCH /api/fiscal/obligations`.

### Selector de Trimestre

Siempre presente en el DOM, deshabilitado (opacity 40%, no oculto) en los tabs donde no aplica (390, IS, Calendario).

### Alertas de verificación

Las alertas `UNUSUAL_RATE` del 303 incluyen un enlace "Ver facturas →" que navega a `/facturas?vatRate=X&type=ISSUED|RECEIVED`. El endpoint `/api/invoices` soporta el filtro `vatRate` (filtra por `InvoiceLine.vatRate`).

### Modelos y Endpoints

| Method | Path                              | Description                            |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | /api/reports/fiscal/303?from&to   | Modelo 303 trimestral                  |
| GET    | /api/reports/fiscal/111?from&to   | Modelo 111 retenciones trabajo         |
| GET    | /api/reports/fiscal/115?from&to   | Modelo 115 retenciones alquileres      |
| GET    | /api/reports/fiscal/390?year      | Resumen anual 390                      |
| GET    | /api/reports/fiscal/is?year       | Impuesto Sociedades                    |
| PATCH  | /api/reports/fiscal/is            | Ajustes extracontables IS              |
| GET    | /api/reports/fiscal/calendar?year | Calendario fiscal                      |
| GET    | /api/fiscal/obligations?year      | Obligaciones fiscales (presentación)   |
| PATCH  | /api/fiscal/obligations           | Marcar/desmarcar obligación presentada |

## Páginas Públicas

### Rutas públicas (no requieren auth)

`/landing`, `/login`, `/signup`, `/recuperar-contrasena`, `/auth/callback`, `/para-gestorias`

Estas rutas están bajo `app/(public)/` o `app/login/`, `app/signup/` — fuera del route group `(app)` que tiene AppShell con auth guard. No hay middleware.ts root; la protección es client-side.

### Errores de Supabase Auth

Todos los mensajes de error de Supabase se traducen con `getAuthErrorMessage()` (`lib/auth/error-messages.ts`) antes de mostrar al usuario. Aplicar en login, signup, y cualquier página que use Supabase Auth.

### Hydration en landing

Las animaciones CSS de la landing usan `landing.css` (archivo estático importado en `app/(public)/landing/page.tsx`). No usar `<style>` tags dinámicos en componentes "use client" — causan hydration mismatch.
