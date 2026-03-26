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

### Gestión de deuda

- **7 tipos de instrumento**: préstamos, pólizas de crédito, líneas de descuento, confirming, leasing, descubiertos, avales
- **Cuadro de amortización**: generación automática (sistema francés), importación, regeneración parcial
- **Covenants**: 6 métricas financieras con monitorización automática y alertas de incumplimiento
- **Reclasificación LP→CP**: propuesta automática al cierre con preview y asiento contable
- **Financing detector**: detecta cuotas de préstamo, comisiones, disposiciones y pagos de leasing en fase 0 del engine
- **Posición de deuda**: deuda total/neta, DSCR, cuotas vencidas, líneas disponibles, tipo medio ponderado

### Integraciones

- **Holded**: sync de contactos, facturas, cuentas, pagos
- **Google Drive / OneDrive**: almacenamiento de facturas con archivado trimestral
- **Gmail / Outlook**: detección de facturas + envío de emails de seguimiento
- **OAuth**: Google + Microsoft login
- **ECB**: tipos de cambio diarios para 31 divisas

### Seguridad

- **Scoped Prisma client**: auto-inyecta companyId en todas las queries (32 modelos)
- **HTTP rate limiting**: 4 tiers (read 100/min, write 30/min, auth 5/min, engine 3/min)
- **Prompt injection defense**: datos de usuario siempre en XML tags
- **Output validation**: Zod schemas + system checks post-LLM
- **Error sanitization**: producción nunca expone detalles internos
- **AES-256-GCM encryption**: para credenciales almacenadas

### Autonomous Follow-Up System (AgentThread)

- **8 escenarios**: cobros vencidos, duplicados, discrepancias proveedor, documentos fiscales, gestoría, devoluciones bancarias, anticipos no identificados, intercompañía
- **Thread manager**: ciclo completo — crear hilo → borrador → aprobación controller → envío → monitorizar → follow-up → auto-resolve o escalar
- **3 modelos**: AgentThread (con supportingDocUrls), ThreadMessage (con attachments + import-on-reply), FollowUpConfig (intervalos + escalado por escenario)
- **Thread documents**: adjuntos en mensajes, import-on-reply con aprobación del controller

### Contacts Agent

- **Importación CSV**: parsing AI (Haiku), deduplicación por NIF normalizado
- **Enriquecimiento**: inferencia de condiciones de pago desde historial bancario (Sonnet)
- **Detección en buzón**: crea contacto básico desde email del remitente antes de procesar factura

### Onboarding Agent

- **Wizard de 8 pasos**: datos empresa → actividad → fiscalidad → inferencia PGC → histórico → calibración → integraciones → resumen
- **Inferencia PGC** (Sonnet): subplan de cuentas + módulos fiscales + contrapartidas desde perfil de negocio
- **Calibración histórica**: parseo de ficheros contables (Haiku) + comparación con plan inferido (Sonnet) → patrones recurrentes
- **BusinessProfile**: modelo 1:1 con Company para almacenar contexto de negocio inferido

### Gestoría Portal

- **Portal colaborativo**: 5 tabs (Alertas, Borradores, Subida, Incidencias, Paquete fiscal)
- **Alertas fiscales AI** (Sonnet): deadlines próximos, borradores listos, anomalías
- **Revisión de borradores**: AI review de modelos fiscales por trimestre con aprobación
- **Subida de documentos**: clasificación automática (Haiku) + incidencias gestoría-controller
- **Matriz fiscal**: 7 tipos de sociedad → modelos aplicables con calendario español completo

### Opening Balance Import

- **CSV parser**: detección automática de separador, importes españoles, columnas flexibles
- **Account mapper**: 3 casos — match exacto, match padre, needsReview
- **JE generator**: validación de cuadre (gap < 1 EUR), asiento DRAFT, idempotente por fecha

### Frontend (28 páginas)

- **Dashboard**: briefing diario + 6 KPIs + 3 acciones rápidas
- **Conciliación**: bandeja con batch actions, barra de confianza, detalle de match
- **Seguimientos**: gestión de inquiries (borradores, esperando respuesta, follow-ups, escalados)
- **Asientos**: journal entries con expansión de líneas, modal de creación, aprobación AI
- **Plan de cuentas**: árbol PGC, libro mayor con saldo running, balance de sumas y saldos
- **Activos fijos**: registro con barra de amortización visual, alta con cuentas PGC
- **Periodificaciones**: devengos recurrentes con progreso, vinculación con facturas
- **Tesorería**: forecast 13 semanas con gráfico SVG inline, detalle semanal expandible
- **Deuda**: posición de deuda (5 KPIs), instrumentos con cuadro amortización expandible, wizard de creación, covenants
- **Cuentas a cobrar/pagar**: aging con 5 buckets, DSO/DPO, riesgo, tracker de impagados
- **Inversiones**: portfolio de participaciones, préstamos, dividendos
- **Documentos soporte**: registro, aprobación, vinculación con banco
- **Fiscal**: IVA, retenciones, modelos fiscales (303/111/115/390), calendario fiscal, reconciliación vs banco
- **Gestoría**: portal colaborativo (alertas, borradores, subida docs, incidencias, paquete fiscal)
- **Setup**: wizard onboarding 8 pasos con inferencia PGC y calibración histórica
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
│  Reportes · Fiscal · Inversiones · Deuda · Ajustes   │
└──────────────────────┬──────────────────────────────┘
                       │ API Routes (123 endpoints)
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
│  Prompt Registry (30+)    │
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
│  Scoped Prisma (32 models) │
│  Multi-tenant isolation    │
│  Auto companyId injection  │
│  FX-aware matchers         │
└───────────────────────────┘
```

## Testing

```bash
npx vitest run              # 751 tests, 77 archivos
npx tsc --noEmit            # Type-check completo
```

Cobertura: motor de conciliación (5 fases, 22 escenarios + 8 follow-up), detectors (9 tipos incl. investment + payroll + equity + financing), matchers (FX-aware + supporting docs), classifiers, resolver (23+ acciones), confidence engine (16 categorías), cascade, agente diario (11 steps), context retriever, calibrador, rate limiting, data isolation, seguridad, accruals, deferred entries, bad debt, supporting documents, equity (regularización + distribución + capital adequacy), fiscal models (303/111/115/390/calendario), seed coherence, VAT/withholding reconciliation, WC bridge, PyG comparativas, FX calculations, debt position report, debt API, agent threads, contacts agent, onboarding agent, gestoría portal, opening balance import.

## Documentación técnica

Ver [CLAUDE.md](CLAUDE.md) para detalles del motor de conciliación, 22 escenarios, sistema de reglas, y decisiones de diseño.

## Estadísticas

- **~56K líneas** de TypeScript
- **52 modelos** Prisma, **68 enums**
- **123 endpoints** API
- **28 páginas** frontend
- **18 componentes** React
- **751 tests** en 77 archivos
- **16 categorías** de confianza
- **23+ acciones** de resolución
- **22 escenarios** de conciliación + **8 follow-up**
- **11 steps** del agente diario
- **31 divisas** soportadas (ECB)
- **3 modelos AI** (Haiku/Sonnet/Opus) con 30+ tareas

## Changelog

### 2026-03-26 — Sprint 11: Tour interactivo

- Tour guiado post-signup: 5 pasos (Dashboard → Conciliación → Seguimientos → Tesorería → Consolidado)
- Custom tour component (spotlight SVG + tooltip posicionado, sin dependencias externas)
- Cross-page navigation via React context + useRouter
- Persistencia: `tourCompletedAt` en User model + localStorage
- Re-trigger desde dashboard ("Repetir tour")
- API: `PATCH /api/user/tour`

### 2026-03-26 — Sprint 10: Páginas públicas

- Fix hydration mismatch en landing (CSS extraído a archivo estático)
- Traducción de errores de Supabase Auth al español (`lib/auth/error-messages.ts`)
- Página de recuperación de contraseña (`/recuperar-contrasena`)
- Inputs con name/id/autocomplete en login y signup (accesibilidad + autofill)
- Validación de formato de email en signup
- Footer links funcionales (anclas a secciones, mailto, "Blog" deshabilitado)
- CTA "Habla con nosotros" → mailto:hola@concilia.es
- Página pública `/para-gestorias` (marketing para gestorías)

### 2026-03-26 — Sprint 6: Lógica condicional en Reporting y bugs menores

- Calendario fiscal con 5 niveles de urgencia cromática (vencido, urgente ≤5d, ≤15d, ≤30d, pendiente) + estado "Presentado" (verde)
- Nuevo modelo `FiscalObligation` con `presentedAt` — tracking de obligaciones fiscales presentadas
- Endpoint `GET/PATCH /api/fiscal/obligations` para marcar/desmarcar obligaciones como presentadas
- Alertas de vencimiento en tabla de instrumentos de deuda (< 30d rojo, < 90d ámbar)
- Banner sticky rojo en balance descuadrado con enlace a conciliación
- Fix: key prop faltante en Fragment de inversiones (React rendering bug)
- Página 404 en español con diseño coherente con login

### 2026-03-26 — Sprint 7 (final QA): Pulido visual transversal

- Fix CRÍTICO: DSO dashboard siempre mostraba "—" — leía `agingData.dso` en vez de `agingData.summary.dso`
- Fix: cabeceras activos sin separación visual — añadido `overflow-x-auto`, `min-w-[800px]`, `formatTableDate()`
- Fix: títulos de cards de acción rápida truncados — reemplazado `truncate` por `leading-tight`
- Fix: "Sin CIF" prominente en contactos — render condicional solo cuando hay CIF
- Fix: email largo desplaza columna facturas en contactos — `table-fixed`, `max-w-[180px]`, tooltip
- Fix: fechas relativas sin tooltip en seguimientos — nueva utilidad `formatRelativeWithTitle()`
- Fix: títulos truncados sin tooltip en seguimientos — añadido `title` a spans con `truncate`
- Fix: fecha en documentos soporte — cambiado a `formatTableDate()` + `whitespace-nowrap`
- Fix: columna Estado cortada en documentos soporte — añadido `min-w-[120px]`
- Fix: tooltip en nombre contacto en cuentas a cobrar
- Ciclo QA completado. Ver CLAUDE.md → "Convenciones de tablas" para estándares establecidos.

### 2026-03-26 — Sprint 8: Módulo Fiscal

- Fix CRÍTICO: aritmética 303 — normalización de vatRate decimal (0.21→21) en vat-generator.ts, tramos IVA ahora clasifican correctamente
- Fix CRÍTICO: discrepancia 303/390 resuelta — ambos usan la misma función calculateModel303
- Fix: Modelo 115 ahora muestra línea "Total a ingresar"
- Nuevo: cabeceras de columna (Concepto / Base imponible / Cuota IVA) en bloques del 303
- Fix: ceros en Resumen 390 ahora en gris neutro, no en rojo
- Fix: selector de Trimestre siempre visible, deshabilitado en tabs anuales (390, IS, Calendario)
- Nuevo: empty states en Modelos 111 y 115 cuando no hay retenciones
- Nuevo: IS con campos editables para gastos no deducibles e ingresos exentos (modelo FiscalAdjustment, PATCH endpoint)
- Nuevo: calendario fiscal interactivo — click navega al modelo/trimestre, badges urgencia (Vencido/Urgente/Próximo/Pendiente)
- Nuevo: alertas de verificación del 303 con enlace "Ver facturas →" a /facturas?vatRate=X&type=Y
- Nuevo: filtro vatRate en endpoint /api/invoices y página de facturas
- Nuevo: deep linking en página fiscal via searchParams (?tab=303&periodo=T1&ejercicio=2026)
- Nuevo: línea "Tipos no clasificados" como catch-all en el 303

### 2026-03-26 — Sprint 4: Facturas y Documentos Soporte

- Fix: persistencia de documentos soporte (auth token faltaba en fetch)
- Fix: columna "Concepto" en facturas muestra `lines[0].description` como fallback
- Nuevo: panel lateral de detalle de factura (líneas, pagos, contacto, conciliaciones)
- Nuevo: endpoint GET `/api/invoices/[id]` con includes completos
- Nuevo: endpoint PATCH `/api/supporting-documents/[id]` para avance de estado
- Nuevo: botones "Contabilizar" y "Conciliar" en documentos soporte
- Nuevo: contadores en tabs de documentos soporte (groupBy)
- Nuevo: badge "NC" para notas de crédito en tabla de facturas
- Nuevo: sumatorio de importes al filtrar facturas (aggregate)
- Fix: dropdown de estado en facturas incluye todos los estados del enum
- Nuevo: `api.patch()` en api-client para peticiones PATCH autenticadas

## Licencia

Privado — Mazinger Ventures.
