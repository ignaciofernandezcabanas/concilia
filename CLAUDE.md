# Concilia — Technical Reference

Concilia es una plataforma de conciliación bancaria automatizada para controllers financieros de PYMEs españolas. Conecta un ERP (Holded) con movimientos bancarios, concilia transacciones automáticamente usando matching determinístico + LLM, y genera reportes financieros (Balance, PyG, EFE) adaptados al Plan General Contable español (PGC 2007).

## Tech Stack

- **Framework**: Next.js 14 (App Router), TypeScript
- **ORM**: Prisma 7 con `@prisma/adapter-pg`
- **DB**: Supabase (PostgreSQL managed)
- **Auth**: Supabase Auth (email + password)
- **LLM**: Anthropic API (`claude-sonnet-4`) — clasificación, parsing de conceptos, NL rules
- **Fuzzy matching**: fuse.js
- **Validation**: Zod
- **Styling**: Tailwind CSS
- **Cron**: Upstash QStash (o CRON_SECRET para dev)

## Estructura de Carpetas

```
app/
  (app)/              # Pages behind auth (AppShell layout)
    page.tsx          # Dashboard
    conciliacion/     # Conciliation + reconciliation report
    facturas/         # Invoices (import PDF, view, delete)
    movimientos/      # Bank transactions (import CSV, delete)
    balance/          # Balance sheet (PGC)
    pyg/              # P&L (PGC)
    cashflow/         # Cash flow (treasury + EFE)
    notificaciones/
    ajustes/          # Settings: users, company, integrations, learning
  login/              # Login page (outside AppShell)
  api/
    invoices/         # CRUD, import (local + Drive), PDF serving
    transactions/     # CRUD, CSV import, batch delete
    reconciliation/   # Run engine, resolve items
    reports/          # PyG, cashflow, reconciliation report, balance
    sync/             # Holded sync
    integrations/     # Holded, Drive, Gmail config
    settings/         # Company, users, rules, learning, thresholds
    cron/             # daily-sync, overdue-check, calibrate-thresholds
    search/           # Global search

lib/
  reconciliation/
    engine.ts         # Main reconciliation pipeline (4 phases)
    resolver.ts       # Unified resolver ($transaction, 11 actions)
    invoice-payments.ts # Unified payment status updater
    decision-tracker.ts # Feedback loop: tracks controller decisions
    constants.ts
    detectors/        # Internal, duplicate, return, financial
    matchers/         # Exact, grouped, fuzzy, LLM
    classifiers/      # Rule-based, LLM-based
    prioritizer.ts
  reports/            # PyG, cashflow, balance, reconciliation report generators
  holded/             # Holded API client + sync modules
  bank/               # GoCardless client, sync, concept parser
  drive/              # Google Drive client, quarterly archiver
  gmail/              # Gmail client (read-only, invoice detection)
  invoices/           # PDF extractor (Claude), Drive uploader
  ai/                 # Anthropic client singleton, rate limiter, prompts
  auth/               # withAuth middleware, permissions, cron-guard
  utils/              # Validation (Zod), pagination, formatting, audit
  types/              # Shared API response types
  pgc-structure.ts    # Full PGC chart (PyG, EFE, Balance structures)
  format.ts           # Client-side formatting (amounts, dates)
  api-client.ts       # Browser-side fetch wrapper with Supabase JWT
  db.ts               # Prisma client singleton
  supabase.ts         # Supabase server client

components/           # React components (Sidebar, TopBar, PgcTable, etc.)
hooks/                # useApi.ts (typed data-fetching hooks)
prisma/               # schema.prisma
```

## Setup Local

```bash
cp .env.example .env   # Fill in Supabase, Anthropic keys
npm install
npx prisma db push     # Create tables (use port 5432 for Supabase)
npx prisma db seed     # Load PGC accounts
npm run dev
```

## Motor de Conciliación (4 fases)

Cada movimiento bancario PENDING pasa por:

1. **Detectors** — internal transfer, duplicate, return, financial operation
2. **Matchers** — exact → partial → grouped → learned patterns → fuzzy → LLM
3. **Classifiers** — rule-based → LLM (for items without invoice match)
4. **Priority** — URGENT / DECISION / CONFIRMATION / ROUTINE

Auto-approval: `confidence >= categoryThreshold AND amount <= materialityThreshold`
Small differences: `|diff| <= materialityMinor AND confidence >= 0.70` → auto-adjust

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

## Sistema de Reglas

- **Explícitas** (MatchingRule): created by controller, 100% confidence, always prevail. Origin: MANUAL, INLINE, PROMOTED.
- **Implícitas** (LearnedPattern): inferred from decisions. Lifecycle: SUGGESTED → ACTIVE_SUPERVISED → PROMOTED/REJECTED.
- **NL creation**: controller types rule in natural language → Claude parses → structured card → confirm.
- **Feedback loop**: every resolve tracks context → learns patterns → calibrates thresholds monthly.

## Decisiones de Diseño

- **Doble umbral**: materialityThreshold (major) prevents auto-approval of large amounts. materialityMinor auto-resolves tiny differences. Conservative by default.
- **LLM como último recurso**: deterministic matchers → rules → LLM. Minimizes cost and latency.
- **Per-category thresholds**: exact matches can have 75% threshold, new classifications 95%+.
- **Circuit breaker**: 3 consecutive LLM errors → pause 60s → UNIDENTIFIED (goes to bandeja).
- **Single resolver**: ALL resolve logic in `lib/reconciliation/resolver.ts` inside `$transaction`. Route handler is thin delegation only.
- **Learning with logging**: no more `.catch(() => {})`. All learning operations use try/catch with console.warn.

## Endpoints Principales

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/invoices | List invoices (filtered, paginated) |
| POST | /api/invoices/import | Import PDFs (Claude extracts data) |
| GET | /api/transactions | List bank transactions |
| POST | /api/transactions/import | Import CSV |
| POST | /api/reconciliation/run | Run reconciliation engine |
| POST | /api/reconciliation/[id]/resolve | Resolve item (11 actions) |
| GET | /api/reports/pyg | P&L report (PGC) |
| GET | /api/reports/cashflow | Cash flow (direct/indirect) |
| GET | /api/reports/balance | Balance sheet |
| GET | /api/reports/reconciliation-report | Monthly reconciliation |
| POST | /api/settings/rules/parse | Parse NL rule → structured |
| GET | /api/settings/learning | Learning stats + patterns + rules |
| GET | /api/settings/thresholds | Per-category thresholds |
