# Concilia

Plataforma de conciliación bancaria automatizada con agente AI para controllers financieros de PYMEs españolas.

Conecta tu ERP (Holded) con los movimientos bancarios, concilia transacciones automáticamente usando matching determinístico + Claude AI, y genera reportes financieros adaptados al Plan General Contable español (PGC 2007).

## Funcionalidades principales

### Conciliación bancaria

- **Motor de 5 fases**: investment/CAPEX pre-detection → detectors → matchers → classifiers → priority
- **22 escenarios**: cobros, pagos, parciales, agrupados, diferencias (con 9 tipos), devoluciones, duplicados, intercompañía, notas de crédito, CAPEX, inversiones financieras, nóminas
- **Classification cascade**: reglas determinísticas → Haiku (rápido) → Sonnet (CoT) → bandeja
- **Auto-aprobación inteligente**: doble umbral (materialidad + confianza por categoría)
- **Match con diferencia**: descuento, comisión, retención IRPF, FX, anticipo, aclaración por email
- **Multi-divisa**: 31 divisas con tipos ECB, matchers FX-aware (2% exact, 7% fuzzy)

### Agente AI diario

- **11 steps por organización**: sync, engine, auto_entries (amortización + accruals + anticipos), intercompañía, provisiones, inquiry follow-up, recordatorios, tesorería, anomalías, fiscal, briefing
- **Confidence engine**: 16 categorías con scoring basado en historial, system checks, y materialidad
- **Feedback loop cerrado**: decisión controller → calibración → ajuste persistido → afecta futuras decisiones
- **Context retrieval**: inyecta decisiones previas relevantes (IBAN/concepto/patrones) en los prompts del LLM
- **Rate limits**: max 1 run/org/día, 20 LLM calls/company, circuit breaker (3 fallos → pausa 60s)

### Agente de seguimiento por email

- **Solicitud de documentos**: el motor detecta items sin factura → genera borrador → controller aprueba → envía
- **Response evaluator**: 3 fases (adjuntos Haiku + texto Sonnet + decisión reglas) con 13 acciones posibles
- **Follow-ups automáticos**: escalado 3→5→7 días, máximo 3 intentos antes de escalar al controller
- **Redirección**: si el contacto dice "pregunta a María", crea nueva inquiry para el nuevo contacto
- **El AI NUNCA envía emails automáticamente** — siempre requiere aprobación del controller

### Reportes financieros (PGC)

- **Balance de Situación** — activo corriente/no corriente, patrimonio neto, pasivo
- **Pérdidas y Ganancias** — 17 líneas PGC + EBITDA + drill-down + comparativas (presupuesto, año anterior, mes anterior, % sobre ventas)
- **Estado de Flujos de Efectivo** — método directo (tesorería) + indirecto (EFE formal) + bloque B inversiones
- **Working Capital Bridge** — waterfall: resultado neto → EBITDA → variación WC → CAPEX → cash neto + reconciliación con banco
- **Previsión de tesorería** — forecast semanal con probabilidades por fuente
- **Libro Mayor** — movimientos por cuenta desde 3 fuentes
- **Balance de Sumas y Saldos** — trial balance desde asientos contables
- **Informe de Antigüedad** — aging AR/AP con buckets, DSO/DPO, y tracker de impagados con criterio fiscal
- **Informe de Conciliación** — saldo contable vs bancario con diferencias
- **Reporte consolidado** — PyG y Balance agregado multi-sociedad
- **Fiscal**: IVA (Modelo 303) + Retenciones (Modelo 111/115) + Modelo 390 + calendario fiscal + reconciliación fiscal vs banco

### Contabilidad

- **Asientos contables** (journal entries): DRAFT → POSTED → REVERSED con validación de balance
- **Activos fijos**: registro, depreciación lineal automática, NBV tracking
- **Periodificaciones recurrentes**: devengos mensuales/trimestrales/anuales con auto-reversión al vincular factura
- **Anticipos**: registro de anticipos de clientes (438) y a proveedores (407), vinculación automática con facturas
- **Insolvencias**: tracker con criterio fiscal español (6 meses + reclamación para deducibilidad, burofax/judicial/notarial)
- **Documentos soporte**: actas de junta, escrituras, contratos, modelos fiscales, nóminas, pólizas, alquileres. JE DRAFT automático con cuentas PGC por tipo. Matching con banco por importe + dirección.
- **Equity**: regularización de resultados (cierre grupo 6/7 → 129), distribución (reservas, dividendos, compensación), capital adequacy check per art. 363.1.e LSC
- **Presupuestos**: por cuenta PGC y mes, con lifecycle DRAFT → APPROVED → CLOSED
- **Periodos contables**: OPEN → SOFT_CLOSED → CLOSED → LOCKED. Soft close permite reporting provisional

### Reconciliaciones fiscales

- **IVA**: reconcilia IVA teórico (desde facturas) vs pagos reales a AEAT en banco. Detecta: timing, descuadre, pago faltante.
- **Retenciones**: reconcilia retenciones calculadas (modelo 111/115) vs pagos a AEAT.
- **Insolvencias**: distingue provisión contable vs provisión fiscalmente deducible (art. 13 LIS).

### Multi-divisa

- **31 divisas** con tipos de cambio diarios del BCE (ECB)
- **Matchers FX-aware**: exact match con 2% tolerancia, fuzzy con 7% para cross-currency
- **Diferencias de cambio**: 668 (negativas) / 768 (positivas) con asiento automático
- **Dropdown UI**: EUR + 30 divisas más comunes para pymes españolas

### Multi-empresa

- **Organization → Company → User** con Memberships y CompanyScopes
- **Context switcher** en sidebar: cambiar entre sociedades al instante
- **Vista consolidada** para OWNER/ADMIN (read-only multi-company)
- **Detección intercompañía**: identifica transferencias entre sociedades del grupo
- **Gestión de sociedades**: métodos de consolidación (FULL, EQUITY, PROPORTIONAL), % participación
- **Onboarding**: empresa individual vs grupo de empresas

### Data Entry

- **Buzón de facturas**: conecta un email dedicado (facturas@empresa.es), importa PDFs adjuntos automáticamente con OCR (Haiku)
- **Importación CSV/N43**: movimientos bancarios con auto-detect (CSV español + Cuaderno 43 AEB)
- **Importación PDF**: facturas individuales o masivas con extracción AI
- **Storage scan**: escaneo de carpeta Drive/OneDrive para PDFs
- **Excel bulk import**: facturas, contactos y activos fijos desde plantilla Excel
- **Saldo inicial**: endpoint idempotente con OPENING_BALANCE
- **Deduplicación**: por holdedId (facturas) y externalId (movimientos)

### Sistema de aprendizaje

- **Reglas explícitas** (MatchingRule): creadas por controller, 100% confianza
- **Patrones implícitos** (LearnedPattern): inferidos de decisiones, lifecycle SUGGESTED → ACTIVE → PROMOTED
- **Creación NL**: describe la regla en español → Claude parsea → tarjeta estructurada → confirmar
- **Calibración persistida**: ConfidenceAdjustment en DB, no in-memory
- **Model router**: Haiku/Sonnet/Opus con routing por tarea, prompt registry centralizado

### Nóminas

- **Detector automático**: identifica SALARY, SS_COMPANY, SS_EMPLOYEE, IRPF por concepto, IBAN, y patrón recurrente
- **Verificación mensual**: comprueba que todos los componentes de nómina (salario + SS + IRPF) están presentes
- **Cuentas PGC**: 640 (sueldos), 642 (SS empresa), 476 (SS empleado), 4751 (IRPF)

### Integraciones

- **Holded**: sync de contactos, facturas, cuentas, pagos
- **Google Drive / OneDrive**: almacenamiento de facturas con archivado trimestral
- **Gmail / Outlook**: detección de facturas + envío de emails de seguimiento
- **OAuth**: Google + Microsoft login
- **ECB**: tipos de cambio diarios para 31 divisas

### Seguridad

- **Scoped Prisma client**: auto-inyecta companyId en todas las queries (29 modelos)
- **HTTP rate limiting**: 4 tiers (read 100/min, write 30/min, auth 5/min, engine 3/min)
- **Prompt injection defense**: datos de usuario siempre en XML tags
- **Output validation**: Zod schemas + system checks post-LLM
- **Error sanitization**: producción nunca expone detalles internos
- **AES-256-GCM encryption**: para credenciales almacenadas

### Frontend (25 páginas)

- **Dashboard**: briefing diario + 6 KPIs + 3 acciones rápidas
- **Conciliación**: bandeja con batch actions, barra de confianza, detalle de match
- **Seguimientos**: gestión de inquiries (borradores, esperando respuesta, follow-ups, escalados)
- **Asientos**: journal entries con expansión de líneas, modal de creación, aprobación AI
- **Plan de cuentas**: árbol PGC, libro mayor con saldo running, balance de sumas y saldos
- **Activos fijos**: registro con barra de amortización visual, alta con cuentas PGC
- **Periodificaciones**: devengos recurrentes con progreso, vinculación con facturas
- **Tesorería**: forecast 13 semanas con gráfico SVG inline, detalle semanal expandible
- **Cuentas a cobrar/pagar**: aging con 5 buckets, DSO/DPO, riesgo, tracker de impagados
- **Inversiones**: portfolio de participaciones, préstamos, dividendos
- **Documentos soporte**: registro, aprobación, vinculación con banco
- **Fiscal**: IVA, retenciones, modelos fiscales (303/111/115/390), calendario fiscal, reconciliación vs banco
- **Intercompañía**: operaciones entre sociedades, confirmación/eliminación
- **Consolidado**: PyG/Balance multi-sociedad con totales

## Quick Start

```bash
git clone https://github.com/ignaciofernandezcabanas/concilia.git
cd concilia
cp .env.example .env   # Rellena con tus credenciales
npm install
npx prisma migrate dev # Crear tablas
npx prisma db seed     # Cargar PGC + datos demo
npm run dev
```

Requiere: Node.js 22+, [Supabase](https://supabase.com) (PostgreSQL + Auth), [Anthropic API key](https://console.anthropic.com).

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

| Capa           | Tecnología                                                          |
| -------------- | ------------------------------------------------------------------- |
| Framework      | Next.js 14 (App Router)                                             |
| Lenguaje       | TypeScript strict                                                   |
| ORM            | Prisma 7 + @prisma/adapter-pg                                       |
| Base de datos  | Supabase (PostgreSQL managed)                                       |
| Auth           | Supabase Auth (email + OAuth)                                       |
| AI             | Anthropic API — Haiku (NLP), Sonnet (razonamiento), Opus (síntesis) |
| FX Rates       | ECB Statistical Data Warehouse API (31 divisas)                     |
| Fuzzy matching | Fuse.js                                                             |
| Validación     | Zod                                                                 |
| Styling        | Tailwind CSS                                                        |
| Cron           | Upstash QStash / CRON_SECRET                                        |
| Storage        | Google Drive / OneDrive (abstracción unificada)                     |
| CI/CD          | GitHub Actions (Node 22)                                            |
| Pre-commit     | Husky + lint-staged (Prettier + ESLint)                             |

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                 │
│  Dashboard · Conciliación · Seguimientos · Facturas  │
│  Reportes · Fiscal · Inversiones · Ajustes           │
└──────────────────────┬──────────────────────────────┘
                       │ API Routes (90+ endpoints)
┌──────────────────────┴──────────────────────────────┐
│                  withAuth Middleware                   │
│  JWT verification · Rate limiting · Scoped DB         │
└──────────────────────┬──────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
┌───┴───┐      ┌───────┴───────┐   ┌─────┴─────┐
│Engine │      │  AI Agent     │   │ Reports   │
│5 fases│      │  11 steps     │   │ PGC + EFE │
│22 esc.│      │  daily cron   │   │ WC Bridge │
└───┬───┘      └───────┬───────┘   └───────────┘
    │                  │
┌───┴──────────────────┴───┐
│     Model Router          │
│  Haiku · Sonnet · Opus    │
│  Prompt Registry (20+)    │
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
│  Scoped Prisma (29 models) │
│  Multi-tenant isolation    │
│  Auto companyId injection  │
│  FX-aware matchers         │
└───────────────────────────┘
```

## Testing

```bash
npx vitest run              # 577 tests, 69 archivos
npx tsc --noEmit            # Type-check completo
```

Cobertura: motor de conciliación (5 fases, 22 escenarios), detectors (8 tipos incl. investment + payroll + equity), matchers (FX-aware + supporting docs), classifiers, resolver (16 acciones), confidence engine (16 categorías), cascade, agente diario (11 steps), context retriever, calibrador, rate limiting, data isolation, seguridad, accruals, deferred entries, bad debt, supporting documents, equity (regularización + distribución + capital adequacy), fiscal models (303/111/115/390/calendario), seed coherence, VAT/withholding reconciliation, WC bridge, PyG comparativas, FX calculations.

## Documentación técnica

Ver [CLAUDE.md](CLAUDE.md) para detalles del motor de conciliación, 22 escenarios, sistema de reglas, y decisiones de diseño.

## Estadísticas

- **~44K líneas** de TypeScript
- **42 modelos** Prisma, **55+ enums**
- **90+ endpoints** API
- **25 páginas** frontend
- **17 componentes** React
- **577 tests** en 69 archivos
- **16 categorías** de confianza
- **16 acciones** de resolución
- **22 escenarios** de conciliación
- **11 steps** del agente diario
- **31 divisas** soportadas (ECB)
- **3 modelos AI** (Haiku/Sonnet/Opus) con 20+ tareas

## Licencia

Privado — Mazinger Ventures.
