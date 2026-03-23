# Reconciliation Logic Reference — Concilia

## Matching Pipeline (execute in order, stop when resolved)

### Stage 1 — Special Detections (before any matching)
Run these detectors on every new bank transaction FIRST:

**Internal transfer detector:**
```
IF bankTransaction.counterpartIban IN company.ownBankAccounts.map(a => a.iban)
THEN classify as INTERNAL, no invoice match needed
     Dr 572 [destination bank] / Cr 572 [source bank]
     confidence = 1.0, auto-approve always
```

**Bank fee detector:**
```
IF bankTransaction.amount < 0
   AND (concept matches /comisi[oó]n|mantenimiento|liquidaci|intereses.*(deudor|negativ)/i
        OR amount is typical fee pattern: -3.50, -15.00, -30.00, etc.)
THEN classify as BANK_FEE
     Dr 626 (comisiones) or 669 (otros gastos financieros) / Cr 572
     confidence = 0.95 if concept match, 0.80 if amount pattern only
```

**Tax payment detector:**
```
IF bankTransaction.concept matches /modelo\s*(303|111|115|200|202|349)/i
   OR counterpartIban matches AEAT known IBANs
THEN classify as TAX_PAYMENT
     Map to corresponding account:
       303 → Dr 475 (HP acreedora IVA)
       111 → Dr 473 (retenciones)
       200 → Dr 630 (impuesto beneficios)
     confidence = 0.90
```

**Payroll detector:**
```
IF bankTransaction.concept matches /n[oó]mina|salario|paga\s*extra|ss\s*empresa/i
   AND amount pattern is negative, round-ish, recurring monthly
THEN classify as PAYROLL
     Dr 640 (sueldos) / Cr 572
     If SS detected separately: Dr 642 / Cr 572
     confidence = 0.85
```

**Loan installment detector:**
```
IF bankTransaction.concept matches /pr[eé]stamo|cuota|amortizaci|hipoteca/i
   AND recurring pattern (same amount ±1% for 3+ months)
THEN classify as LOAN_PAYMENT, flag for SPLIT
     The user must split into:
       Dr 170/520 (principal) + Dr 662 (interest) / Cr 572
     confidence = 0.80, NEVER auto-approve (needs split confirmation)
```

**Duplicate detector:**
```
IF EXISTS bankTransaction B2 WHERE
   B2.amount = B1.amount
   AND B2.valueDate within ±2 days of B1.valueDate
   AND B2.counterpartIban = B1.counterpartIban
   AND B2.id != B1.id
   AND B2.status != 'DUPLICATE_CONFIRMED'
THEN flag both as POSSIBLE_DUPLICATE
     Create DuplicateGroup, link both transactions
     priority = HIGH, NEVER auto-approve
```

### Stage 2 — Exact Match
```typescript
// Find invoices where:
// - invoice.contact.iban === bankTransaction.counterpartIban
//   OR invoice.contact.name fuzzy matches concept
// - ABS(invoice.totalAmount - ABS(bankTransaction.amount)) < 0.01
// - invoice.dueDate within bankTransaction.valueDate ± 30 days
// - invoice.status IN ['PENDING', 'PARTIALLY_PAID']
//
// If EXACTLY ONE match found:
//   confidence = 0.95 (IBAN match) or 0.90 (name match)
//   If invoice.totalAmount === ABS(bankTransaction.amount) → FULL match
//   If invoice.totalAmount > ABS(bankTransaction.amount) → PARTIAL payment
//
// If MULTIPLE matches found with same amount:
//   → pass to Stage 3 (grouped) or flag for human review
```

### Stage 3 — Grouped Match
```typescript
// Find combinations of 2-5 invoices from SAME contact where:
// - SUM(invoices.totalAmount) === ABS(bankTransaction.amount) within ±0.01
// - All invoices are PENDING or PARTIALLY_PAID
// - All invoices due within ±45 days of bank date
//
// Use subset-sum algorithm with early termination.
// Max combinations to check: 1000 (avoid O(2^n) explosion for contacts with many invoices)
//
// If found:
//   confidence = 0.85 (exact sum) or 0.75 (sum within ±1%)
//   Create one Reconciliation per invoice, all with same bankTransactionId
```

### Stage 4 — Fuzzy Match
```typescript
// Relax constraints:
// - Amount within ±2% (covers rounding, small discounts, bank charges absorbed)
// - Contact match via fuse.js on concept text (threshold 0.6)
// - Date range expanded to ±60 days
//
// Score using the weighted confidence formula from SKILL.md
// Only propose if confidence >= 0.65
```

### Stage 5 — LLM Match (Claude API)
```typescript
// When stages 1-4 produce no result OR confidence < 0.65:
// Send to Claude with:
//   - The bank transaction details
//   - Up to 10 candidate invoices (best fuzzy matches + recent unmatched from same contact)
//   - Company context (industry, typical transaction patterns)
//   - Recent reconciliation history (what patterns were approved before)
//
// Claude returns: matched invoiceId (or null), PGC classification, reasoning
// Use the runtime prompt from lib/ai/prompts/reconciliation.ts
```

### Stage 6 — Unmatched Classification
```typescript
// If no invoice match found at any stage:
// Classify the transaction by type using rules + LLM:
//   - Apply MatchingRule table (learned patterns)
//   - If no rule matches → LLM classification (lib/ai/prompts/classifier.ts)
//   - Assign PGC account, cashflowType
//   - Set priority based on amount and type
```

## Resolver Actions

When the controller takes action on a reconciliation item, execute exactly this:

```typescript
type ResolverAction =
  | { type: 'APPROVE_MATCH'; reconciliationId: string }
  | { type: 'REJECT_MATCH'; reconciliationId: string; reason: string }
  | { type: 'MANUAL_MATCH'; bankTransactionId: string; invoiceId: string }
  | { type: 'PARTIAL_PAYMENT'; bankTransactionId: string; invoiceId: string; amount: number }
  | { type: 'GROUPED_PAYMENT'; bankTransactionId: string; invoiceIds: string[] }
  | { type: 'SPLIT_TRANSACTION'; bankTransactionId: string; splits: Array<{ accountCode: string; amount: number; description: string }> }
  | { type: 'CLASSIFY_NO_INVOICE'; bankTransactionId: string; accountCode: string; cashflowType: CashflowType }
  | { type: 'MARK_DUPLICATE'; duplicateGroupId: string; keepTransactionId: string }
  | { type: 'CONFIRM_BOTH_LEGITIMATE'; duplicateGroupId: string }
  | { type: 'INVESTIGATE'; bankTransactionId: string; note: string }
  | { type: 'REOPEN'; reconciliationId: string }

// APPROVE_MATCH:
//   1. Set reconciliation.status = APPROVED, reconciliation.resolvedAt = now()
//   2. Set bankTransaction.status = RECONCILED
//   3. Update invoice.status = PAID (or PARTIALLY_PAID if partial)
//   4. If amount difference exists and is < materialityThreshold:
//      create adjustment entry (Dr/Cr 659/759 for discounts)
//   5. Check if MatchingRule should be created for this pattern
//   6. Create AuditLog entry

// SPLIT_TRANSACTION:
//   1. Validate: SUM(splits.amount) === ABS(bankTransaction.amount)
//   2. Create one Reconciliation per split (no invoice, just classification)
//   3. Each reconciliation gets its own accountCode
//   4. Set bankTransaction.status = RECONCILED
//   5. Create AuditLog entry
//   TYPICAL USE: loan installment → principal (520) + interest (662) + fees (669)
```

## Priority Assignment

After matching, assign priority for the controller's triage queue:

```typescript
function assignPriority(tx: BankTransaction, match: MatchResult | null): Priority {
  // CRITICAL: large unmatched amounts
  if (!match && Math.abs(tx.amount) > company.materialityThreshold * 5)
    return 'CRITICAL';

  // HIGH: duplicates, partial payments, large amounts
  if (tx.isDuplicate) return 'HIGH';
  if (match?.type === 'PARTIAL') return 'HIGH';
  if (Math.abs(tx.amount) > company.materialityThreshold) return 'HIGH';

  // MEDIUM: low-confidence matches, amounts near materiality
  if (match && match.confidence < 0.80) return 'MEDIUM';
  if (Math.abs(tx.amount) > company.materialityThreshold * 0.5) return 'MEDIUM';

  // LOW: everything else (small, high-confidence, or auto-classified)
  return 'LOW';
}
```
