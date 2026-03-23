# Concilia

Plataforma de conciliación bancaria automatizada con agente AI para controllers financieros de PYMEs españolas.

Conecta tu ERP (Holded) con los movimientos bancarios, concilia transacciones automáticamente usando matching determinístico + Claude AI, y genera reportes financieros adaptados al Plan General Contable español (PGC 2007).

## Funcionalidades principales

### Conciliación bancaria
- **Motor de 4 fases**: detectors → matchers → classifiers → priority
- **18 escenarios**: cobros, pagos, parciales, agrupados, diferencias, devoluciones, duplicados, intercompañía, notas de crédito
- **Classification cascade**: reglas determinísticas → Haiku (rápido) → Sonnet (CoT) → bandeja
- **Auto-aprobación inteligente**: doble umbral (materialidad + confianza por categoría)

### Agente AI diario
- **11 steps por organización**: sync, engine, amortizaciones, intercompañía, provisiones, recordatorios, tesorería, anomalías, fiscal, cierre, briefing
- **Confidence engine**: 16 categorías con scoring basado en historial, system checks, y materialidad
- **Feedback loop cerrado**: decisión controller → calibración → ajuste persistido → afecta futuras decisiones
- **Context retrieval**: inyecta decisiones previas relevantes (IBAN/concepto/patrones) en los prompts del LLM
- **Rate limits**: max 1 run/org/día, 20 LLM calls/company, circuit breaker (3 fallos → pausa 60s)

### Reportes financieros (PGC)
- **Balance de Situación** — activo corriente/no corriente, patrimonio neto, pasivo
- **Pérdidas y Ganancias** — 17 líneas PGC + EBITDA + drill-down por cuenta
- **Estado de Flujos de Efectivo** — método directo (tesorería) + indirecto (EFE formal)
- **Previsión de tesorería** — forecast semanal con probabilidades por fuente
- **Libro Mayor** — movimientos por cuenta desde 3 fuentes (asientos, txs clasificadas, facturas)
- **Balance de Sumas y Saldos** — trial balance desde asientos contables
- **Informe de Antigüedad** — aging AR/AP con buckets y DSO/DPO
- **Informe de Conciliación** — saldo contable vs bancario con diferencias
- **Reporte consolidado** — PyG y Balance agregado multi-sociedad
- **Fiscal**: IVA (Modelo 303) + Retenciones (Modelo 111/115)

### Multi-empresa
- **Organization → Company → User** con Memberships y CompanyScopes
- **Context switcher** en sidebar: cambiar entre sociedades al instante
- **Vista consolidada** para OWNER/ADMIN (read-only multi-company)
- **Detección intercompañía**: identifica transferencias entre sociedades del grupo
- **Onboarding**: empresa individual vs grupo de empresas

### Contabilidad
- **Asientos contables** (journal entries): DRAFT → POSTED → REVERSED con validación de balance
- **Activos fijos**: registro, depreciación lineal automática, NBV tracking
- **Presupuestos**: por cuenta PGC y mes, con lifecycle DRAFT → APPROVED → CLOSED
- **Periodos contables**: OPEN → CLOSED → LOCKED con guard en operaciones

### Data Entry
- **Buzón de facturas**: conecta un email dedicado (facturas@empresa.es), importa PDFs adjuntos automáticamente con OCR (Haiku)
- **Importación CSV**: movimientos bancarios con auto-detect de formato
- **Importación PDF**: facturas individuales o masivas con extracción AI
- **Storage scan**: escaneo de carpeta Drive/OneDrive para PDFs
- **Deduplicación**: por holdedId (facturas) y externalId (movimientos)

### Sistema de aprendizaje
- **Reglas explícitas** (MatchingRule): creadas por controller, 100% confianza
- **Patrones implícitos** (LearnedPattern): inferidos de decisiones, lifecycle SUGGESTED → ACTIVE → PROMOTED
- **Creación NL**: describe la regla en español → Claude parsea → tarjeta estructurada → confirmar
- **Calibración persistida**: ConfidenceAdjustment en DB, no in-memory
- **Model router**: Haiku/Sonnet/Opus con routing por tarea, prompt registry centralizado

### Integraciones
- **Holded**: sync de contactos, facturas, cuentas, pagos
- **Google Drive / OneDrive**: almacenamiento de facturas con archivado trimestral
- **Gmail / Outlook**: detección de facturas (read-only)
- **OAuth**: Google + Microsoft login

### Seguridad
- **Scoped Prisma client**: auto-inyecta companyId en todas las queries (22 modelos)
- **HTTP rate limiting**: 4 tiers (read 100/min, write 30/min, auth 5/min, engine 3/min)
- **Prompt injection defense**: datos de usuario siempre en XML tags
- **Output validation**: Zod schemas + system checks post-LLM
- **Error sanitization**: producción nunca expone detalles internos
- **AES-256-GCM encryption**: para credenciales almacenadas

### Frontend (19 páginas)
- **Dashboard**: briefing diario + 6 KPIs + 3 acciones rápidas
- **Bandeja**: conciliación con batch actions y barra de confianza
- **Asientos**: journal entries con expansión de líneas, modal de creación, aprobación AI
- **Plan de cuentas**: árbol PGC, libro mayor con saldo running, balance de sumas y saldos
- **Activos fijos**: registro con barra de amortización visual, alta con cuentas PGC
- **Tesorería**: forecast 13 semanas con gráfico SVG inline, detalle semanal expandible
- **Cuentas a cobrar/pagar**: aging con 5 buckets, DSO/DPO, riesgo por contacto
- **Intercompañía**: operaciones entre sociedades, confirmación/eliminación
- **Consolidado**: PyG/Balance multi-sociedad con totales

## Quick Start

```bash
git clone https://github.com/ignaciofernandezcabanas/concilia.git
cd concilia
cp .env.example .env   # Rellena con tus credenciales
npm install
npx prisma db push     # Crear tablas
npx prisma db seed     # Cargar PGC + datos demo
npm run dev
```

Requiere: Node.js 18+, [Supabase](https://supabase.com) (PostgreSQL + Auth), [Anthropic API key](https://console.anthropic.com).

### Variables de entorno

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
ENCRYPTION_KEY=...           # Para AES-256-GCM
CRON_SECRET=...              # Para cron endpoints en dev
```

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript strict |
| ORM | Prisma 7 + @prisma/adapter-pg |
| Base de datos | Supabase (PostgreSQL managed) |
| Auth | Supabase Auth (email + OAuth) |
| AI | Anthropic API — Haiku (NLP), Sonnet (razonamiento), Opus (síntesis) |
| Fuzzy matching | Fuse.js |
| Validación | Zod |
| Styling | Tailwind CSS |
| Cron | Upstash QStash / CRON_SECRET |
| Storage | Google Drive / OneDrive (abstracción unificada) |

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                 │
│  Dashboard · Conciliación · Facturas · Movimientos   │
│  Reportes · Ajustes · Automatización                 │
└──────────────────────┬──────────────────────────────┘
                       │ API Routes (59 endpoints)
┌──────────────────────┴──────────────────────────────┐
│                  withAuth Middleware                   │
│  JWT verification · Rate limiting · Scoped DB         │
└──────────────────────┬──────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
┌───┴───┐      ┌───────┴───────┐   ┌─────┴─────┐
│Engine │      │  AI Agent     │   │ Reports   │
│4 fases│      │  11 steps     │   │ PGC + EFE │
│       │      │  daily cron   │   │ forecast  │
└───┬───┘      └───────┬───────┘   └───────────┘
    │                  │
┌───┴──────────────────┴───┐
│     Model Router          │
│  Haiku · Sonnet · Opus    │
│  Prompt Registry          │
│  Rate Limiter + Breaker   │
└───────────┬───────────────┘
            │
┌───────────┴───────────────┐
│  Confidence Engine         │
│  16 categorías · Calibrator│
│  System Checks · Cascade   │
│  Context Retriever         │
└───────────┬───────────────┘
            │
┌───────────┴───────────────┐
│  Scoped Prisma (22 models) │
│  Multi-tenant isolation    │
│  Auto companyId injection  │
└───────────────────────────┘
```

## Endpoints principales

| Method | Path | Descripción |
|--------|------|-------------|
| GET | /api/invoices | Listar facturas (filtrado, paginado) |
| POST | /api/invoices/import | Importar PDFs (extracción con IA) |
| GET | /api/transactions | Listar movimientos bancarios |
| POST | /api/transactions/import | Importar CSV |
| POST | /api/reconciliation/run | Ejecutar motor de conciliación |
| POST | /api/reconciliation/[id]/resolve | Resolver item (12 acciones) |
| POST | /api/reconciliation/batch-resolve | Resolver múltiples items |
| GET | /api/reports/pyg | Pérdidas y Ganancias |
| GET | /api/reports/balance | Balance de Situación |
| GET | /api/reports/cashflow | Estado de Flujos de Efectivo |
| GET | /api/reports/forecast | Previsión de tesorería |
| GET | /api/reports/aging | Informe de antigüedad AR/AP |
| GET | /api/reports/ledger | Libro Mayor por cuenta |
| GET | /api/reports/trial-balance | Balance de Sumas y Saldos |
| GET | /api/reports/consolidated | Reportes consolidados multi-sociedad |
| GET | /api/fiscal | IVA (303) y Retenciones (111/115) |
| POST | /api/journal-entries | Crear asiento contable |
| GET | /api/fixed-assets | Activos fijos con amortización |
| GET | /api/budgets | Presupuestos por cuenta y mes |
| GET | /api/settings/automation | Configuración del agente AI |
| GET | /api/settings/automation/learning | Métricas de aprendizaje |
| GET | /api/agent-runs | Historial de ejecuciones del agente |
| POST | /api/cron/daily-agent | Agente AI diario (cron) |

## Testing

```bash
npx vitest run              # 308 tests, 25 archivos
npx tsc --noEmit            # Type-check completo
```

Cobertura: motor de conciliación, detectors, matchers, classifiers, resolver (12 acciones), confidence engine (16 categorías), cascade (4 niveles), agente diario (11 steps), context retriever, calibrador, rate limiting, data isolation, seguridad.

## Documentación técnica

Ver [CLAUDE.md](CLAUDE.md) para detalles del motor de conciliación, 18 escenarios, sistema de reglas, y decisiones de diseño.

## Estadísticas

- **~32.300 líneas** de TypeScript
- **34 modelos** Prisma
- **59 endpoints** API
- **19 páginas** frontend
- **16 componentes** React
- **316 tests** en 26 archivos
- **16 categorías** de confianza
- **12 acciones** de resolución
- **11 steps** del agente diario
- **3 modelos AI** (Haiku/Sonnet/Opus) con 16 tareas

## Licencia

Privado — Mazinger Ventures.
