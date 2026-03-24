---
name: group-controller
description: >
  Senior Group Controller expertise for building Concilia's financial control platform.
  Covers reconciliation logic, PGC classification, multi-entity consolidation, FX translation,
  close processes, variance analysis, and reporting. ALWAYS use this skill when working on:
  reconciler.js, classifier.js, any matcher, report generation, the reconciliation resolver,
  invoice processing, bank transaction classification, PGC account mapping, cashflow logic,
  fiscal engine, dashboard KPIs, variance analysis, or any financial logic in /lib/.
  Also use when designing DB schema changes for financial entities, API routes for
  /api/reconciliation/*, /api/reports/*, /api/sync/*, or UI components that display
  financial data. Use even when the task seems simple — a wrong accounting treatment
  in the code propagates silently and corrupts all downstream reporting.
---

# Group Controller Expertise for Concilia

You are building a financial control platform. Every piece of financial logic you write
will be used by a controller to make real decisions. Treat code correctness here with
the same rigor as an auditor reviewing journal entries.

## Concilia Architecture Context

```
concilia/
├── .claude/skills/group-controller/   ← YOU ARE HERE
├── lib/
│   ├── ai/
│   │   ├── prompts/                   ← Runtime system prompts for Claude API calls
│   │   │   ├── reconciliation.ts      ← Matching & classification prompt
│   │   │   ├── classifier.ts          ← PGC account classification prompt
│   │   │   └── anomaly.ts             ← Anomaly detection prompt
│   │   └── client.ts                  ← Anthropic SDK wrapper
│   ├── reconciliation/
│   │   ├── matchers/                  ← Deterministic matching (exact, fuzzy, grouped)
│   │   ├── classifiers/               ← Rule-based PGC classification
│   │   ├── detectors/                 ← Duplicates, returns, splits, internals
│   │   └── resolver.ts               ← Action execution (approve, reject, split, etc.)
│   ├── reports/                       ← P&L (PGC PYMEs), cashflow, reconciliation report
│   ├── holded/                        ← Holded API integration
│   ├── bank/                          ← Open Banking integration
│   └── fiscal/                        ← Tax calculations (IVA, IRPF, PGC)
├── prisma/schema.prisma
└── app/api/                           ← Next.js API routes
```

## Financial Logic Rules — NEVER Violate These

### 1. Accounting Equation

Every operation that touches balances MUST maintain: Assets = Liabilities + Equity.
If you're creating a reconciliation entry, a journal adjustment, or any balance mutation,
verify the equation holds. If it doesn't, you have a bug.

### 2. Double Entry

Every transaction has at least one debit and one credit. They MUST sum to the same amount.
When building reconciliation entries or classification logic:

- Debit increases assets and expenses
- Credit increases liabilities, equity, and revenue
- NEVER create a one-sided entry

### 3. PGC Account Classification — Spanish Chart of Accounts

Concilia uses PGC 2007 (adaptación PYMEs). Account groups:

| Group | Range   | Nature                                      | Normal Balance                  |
| ----- | ------- | ------------------------------------------- | ------------------------------- |
| 1     | 100-199 | Equity & Long-term liabilities              | Credit                          |
| 2     | 200-299 | Fixed assets                                | Debit                           |
| 3     | 300-399 | Inventory                                   | Debit                           |
| 4     | 400-499 | Creditors & Debtors                         | Mixed (400s credit, 430s debit) |
| 5     | 500-599 | Financial accounts (bank, cash, short-term) | Mixed                           |
| 6     | 600-699 | Expenses                                    | Debit                           |
| 7     | 700-799 | Revenue                                     | Credit                          |

Key accounts used in reconciliation:

- 572: Bancos (the bank balance — ALWAYS matches the bank statement)
- 430: Clientes (AR — matched against incoming payments)
- 400: Proveedores (AP — matched against outgoing payments)
- 475: HP acreedora por IVA (IVA collected, pending payment to Hacienda)
- 472: HP deudora por IVA (IVA paid, pending deduction)
- 473: HP retenciones IRPF
- 621: Arrendamientos (leases, rent)
- 625: Primas de seguros
- 626: Servicios bancarios (bank fees — auto-classify when detected)
- 627: Publicidad y propaganda
- 628: Suministros (utilities)
- 629: Otros servicios
- 631: Otros tributos
- 640: Sueldos y salarios
- 642: Seguridad Social a cargo de la empresa
- 662: Intereses de deudas (loan interest — split from principal)
- 669: Otros gastos financieros
- 700: Ventas de mercaderías
- 705: Prestaciones de servicios
- 769: Otros ingresos financieros (bank interest earned)

### 4. Reconciliation Matching Rules

**Match quality hierarchy (implement in this order):**

1. EXACT: Same amount + same contact/IBAN + date within ±5 days → confidence ≥ 0.95
2. GROUPED: Multiple invoices sum to bank amount + same contact → confidence ≥ 0.85
3. FUZZY: Amount within ±2% + concept contains contact name → confidence ≥ 0.70
4. LLM: When deterministic matchers fail → Claude analyzes context → confidence varies

**Auto-approval criteria (both must be true):**

- confidence ≥ company.autoApproveThreshold (default 0.90)
- amount < company.materialityThreshold (default €500)
- NEVER auto-approve: duplicates, partial payments, amounts > materialityThreshold

**Critical matching edge cases:**

- **Partial payments**: Bank amount < invoice amount. Create reconciliation with
  `differenceAmount`, keep invoice status as PARTIALLY_PAID, track remaining balance.
- **Grouped payments**: One bank transaction covers multiple invoices. Create one
  Reconciliation per invoice, all linked to same bankTransactionId.
- **Returns/refunds**: Negative bank amount matching a credit note. Don't confuse with
  duplicate detection.
- **Loan installments**: Split into principal (170/520) + interest (662) + fees (669).
  The bank shows ONE amount; the accounting needs THREE entries.
- **Internal transfers**: Own IBAN → Own IBAN. Classify as internal, don't treat as revenue/expense.
- **Bank fees**: Auto-detect (small amounts, concepts like "COMISION", "MANTENIMIENTO").
  Classify to 626/669 without requiring a matching invoice.
- **Tax payments**: Detect modelo 303 (IVA), modelo 111 (retenciones), modelo 200 (IS).
  Classify to 475/473/630 respectively.
- **Payroll**: Detect nómina patterns. Classify 640 (salaries) + 642 (SS empresa).

### 5. FX and Multi-Currency

If Concilia ever handles multi-currency entities:

- Bank transactions: record in original currency AND company currency
- Translation: use closing rate for balance sheet, average rate for P&L
- FX differences on monetary items → P&L (account 668/768)
- NEVER mix currencies in a reconciliation without explicit conversion
- Store the rate used and its source/date

### 6. Reporting Logic

**P&L (PyG PGC PYMEs — 17 line items):**

- Revenue = sum of group 70x accounts
- COGS = sum of group 60x accounts + inventory variation (group 61x)
- Gross margin = Revenue - COGS
- Operating expenses = groups 62x-64x
- EBITDA = Gross margin - Operating expenses (NOT a PGC line but required for management)
- Depreciation = 68x
- EBIT = EBITDA - Depreciation
- Financial result = 76x - 66x
- PBT = EBIT + Financial result
- Tax = 630/633
- Net income = PBT - Tax

**Cashflow (two modes):**

- Treasury mode (for dashboard): direct method from bank transactions, grouped by cashflow type
- EFE formal mode (for reporting): indirect method from P&L + BS movements

**Variance analysis:**
Always decompose into: volume, price/rate, mix, scope, FX, one-offs.
Never present a variance without decomposition.

### 7. Confidence Scoring

When calculating match confidence, use weighted factors:

```typescript
const confidence =
  amountMatch * 0.4 + // 1.0 if exact, 0.8 if ±1%, 0.5 if ±5%, 0 if >5%
  contactMatch * 0.25 + // 1.0 if IBAN match, 0.8 if name fuzzy match, 0 if unknown
  dateMatch * 0.15 + // 1.0 if ±3 days, 0.7 if ±7 days, 0.3 if ±30 days, 0 if >30
  conceptMatch * 0.1 + // 1.0 if invoice number in concept, 0.5 if partial match
  historyMatch * 0.1; // 1.0 if matching rule exists for this pattern
```

NEVER inflate confidence. A false positive auto-approval is worse than requiring human review.

### 8. Data Integrity

- Every mutation to financial data must create an AuditLog entry
- Soft deletes only (set deletedAt, never DELETE FROM)
- All queries MUST filter by companyId (multi-tenancy)
- Reconciliation status transitions must be validated:
  PENDING → APPROVED | REJECTED | INVESTIGATING
  INVESTIGATING → APPROVED | REJECTED
  APPROVED → REOPENED (creates new PENDING)
  REJECTED → REOPENED (creates new PENDING)
  Never skip states. Never go backwards without REOPENED.

## Reference Files

Read these BEFORE implementing domain-specific logic:

| When building...                            | Read first                           |
| ------------------------------------------- | ------------------------------------ |
| Reconciliation matchers/resolver            | `references/reconciliation-logic.md` |
| PGC classification or fiscal engine         | `references/pgc-classification.md`   |
| Report generation (P&L, cashflow, variance) | `references/reporting-logic.md`      |
| Close process or period management          | `references/close-process.md`        |

## Code Standards for Financial Logic

- All amounts stored as `Float` in Prisma, but compute with `Decimal.js` or
  equivalent to avoid floating point errors. Round to 2 decimal places at storage.
- All dates in UTC. Display in company timezone.
- All financial functions must be pure (same input → same output) and testable.
- Log every LLM call with input/output for auditability.
- TypeScript strict mode. No `any` types in financial logic.
- Every financial calculation must have a unit test with known expected values.
