# PGC Classification Reference — Concilia

## Account Mapping by Transaction Type

### Revenue (Group 7)

| Detected Pattern                    | PGC Account                      | Notes                              |
| ----------------------------------- | -------------------------------- | ---------------------------------- |
| Invoice payment received (goods)    | 700 Ventas de mercaderías        | Match against emitted invoice      |
| Invoice payment received (services) | 705 Prestaciones de servicios    | Match against emitted invoice      |
| Bank interest earned                | 769 Otros ingresos financieros   | Auto-classify, no invoice          |
| Insurance claim received            | 778 Ingresos excepcionales       | Flag as one-off                    |
| Tax refund                          | 4709 HP deudora por devoluciones | Reduce tax receivable, not revenue |

### Expenses (Group 6)

| Detected Pattern                 | PGC Account                   | Notes                                   |
| -------------------------------- | ----------------------------- | --------------------------------------- |
| Supplier invoice (goods)         | 600 Compras de mercaderías    | Match against received invoice          |
| Supplier invoice (services)      | 629 Otros servicios           | Match against received invoice          |
| Rent / lease payment             | 621 Arrendamientos            | Recurring, same amount monthly          |
| Insurance premium                | 625 Primas de seguros         | Quarterly/annual, match to policy       |
| Bank fee / commission            | 626 Servicios bancarios       | Auto-classify, no invoice needed        |
| Utilities                        | 628 Suministros               | Match concept: luz, gas, agua, teléfono |
| Advertising / marketing          | 627 Publicidad y propaganda   | Match against invoice or auto-classify  |
| Professional fees (legal, audit) | 623 Servicios profesionales   | Match against received invoice          |
| Transport / shipping             | 624 Transportes               | Match against invoice                   |
| Travel / meals                   | 629 Otros servicios           | Subcategorize in description            |
| Payroll                          | 640 Sueldos y salarios        | Nómina pattern, monthly                 |
| Social security (company)        | 642 SS a cargo empresa        | Monthly, follows payroll                |
| Loan interest                    | 662 Intereses de deudas       | Split from loan installment             |
| Other financial expenses         | 669 Otros gastos financieros  | Bank charges, FX losses                 |
| Municipal taxes (IBI, IAE)       | 631 Otros tributos            | Annual/quarterly                        |
| Depreciation                     | 681 Amortización inmovilizado | Journal entry, not bank transaction     |

### Balance Sheet (Groups 1-5)

| Detected Pattern               | PGC Account                     | Notes                                  |
| ------------------------------ | ------------------------------- | -------------------------------------- |
| Loan principal repayment       | 520 Deudas CP entidades crédito | Reduce liability, split from interest  |
| Long-term loan draw-down       | 170 Deudas LP entidades crédito | Inflow, increase liability             |
| Fixed asset purchase           | 21x/22x (by type)               | Capitalize, don't expense              |
| IVA paid to Hacienda (mod 303) | 475 HP acreedora IVA            | Reduce liability                       |
| IVA refund received            | 4700 HP deudora IVA             | Reduce receivable                      |
| IRPF retention paid (mod 111)  | 4751 HP acreedora retenciones   | Reduce liability                       |
| IS payment (mod 200/202)       | 4752 HP acreedora IS            | Reduce liability                       |
| Dividend paid                  | 526 Dividendo activo a pagar    | Reduce liability                       |
| Capital contribution           | 100 Capital social              | Increase equity                        |
| Internal transfer              | 572 → 572                       | Dr bank B / Cr bank A, zero P&L impact |

## IVA Treatment

### IVA on Purchases (input VAT)

When classifying an expense with IVA:

```
Total payment: €121.00
Split:
  Dr 6xx (expense)        €100.00   ← base imponible
  Dr 472 (IVA soportado)   €21.00   ← IVA deducible
  Cr 572 (banco)          €121.00
```

### IVA on Sales (output VAT)

When receiving a payment for an emitted invoice with IVA:

```
Total received: €121.00
The invoice already recorded:
  Dr 430 (clientes)       €121.00
  Cr 700 (ventas)         €100.00
  Cr 477 (IVA repercutido) €21.00
Bank receipt just settles the receivable:
  Dr 572 (banco)          €121.00
  Cr 430 (clientes)       €121.00
```

### IVA Special Cases

- **Non-deductible IVA** (personal use, exempt activities): entire amount to expense
- **Reduced rate (10%)**: food, transport, housing — detect from invoice/concept
- **Super-reduced (4%)**: basic food, books, pharma
- **Exempt (0%)**: medical, education, financial services, insurance
- **Intra-EU (reverse charge)**: IVA = 0 on invoice, buyer self-assesses.
  CRITICAL: still record Dr 472 / Cr 477 (net zero but must appear in modelo 303)

### IRPF Retentions on Invoices

When an emitted invoice has 15% IRPF retention:

```
Invoice total: base €1,000 + IVA €210 - IRPF €150 = €1,060 to receive
When bank receives €1,060:
  Dr 572        €1,060
  Dr 473         €150   ← IRPF retention (receivable from Hacienda)
  Cr 430       €1,210   ← Full invoice amount including IVA
```

The retention is NOT a discount. It's a prepayment of tax that the client pays
to Hacienda on your behalf. Account 473 accumulates through the year and clears
against the annual IRPF declaration.

## Classification Decision Tree

For unmatched bank transactions (no invoice match found):

```
1. Is amount positive (inflow)?
   ├── Matches own IBAN on other side? → INTERNAL TRANSFER (572→572)
   ├── Concept contains "interés/intereses" + small amount? → 769 bank interest
   ├── Concept contains "devolución/reembolso hacienda"? → 4700/4709 tax refund
   ├── Has recurring pattern from same payer? → Likely missed invoice, flag HIGH
   └── Unknown → flag for human, classify as 555 (partidas pendientes) temporarily

2. Is amount negative (outflow)?
   ├── Matches own IBAN? → INTERNAL TRANSFER
   ├── Bank fee pattern? → 626/669
   ├── Tax payment pattern? → 475/473/4752
   ├── Payroll pattern? → 640/642
   ├── Recurring + same amount + concept matches utility? → 628
   ├── Recurring + same amount + concept matches rent? → 621
   ├── Loan pattern? → SPLIT (520+662) → flag for confirmation
   └── Unknown → flag for human, classify as 555 temporarily
```

Account 555 (Partidas pendientes de aplicación) is the controller's "inbox":
any transaction that can't be classified goes here and MUST be resolved before
period close. The close process should check: `SELECT COUNT(*) FROM reconciliations WHERE accountCode = '555' AND period = current_period` — if > 0, block close.

## Learning from Controller Decisions

After each manual classification by the controller:

```typescript
// Check if this pattern should become a MatchingRule
async function maybeCreateRule(tx: BankTransaction, classification: Classification) {
  // Count: how many times has the controller classified similar transactions the same way?
  const similar = await prisma.reconciliation.count({
    where: {
      bankTransaction: {
        counterpartIban: tx.counterpartIban,
        // OR concept fuzzy match
      },
      accountCode: classification.accountCode,
      status: "APPROVED",
    },
  });

  // If 3+ consistent classifications from same source → propose rule
  if (similar >= 3) {
    await prisma.matchingRule.create({
      data: {
        type: tx.counterpartIban ? "IBAN_CLASSIFY" : "CONCEPT_CLASSIFY",
        counterpartIban: tx.counterpartIban,
        conceptPattern: extractConceptPattern(tx.concept),
        action: "classify",
        accountCode: classification.accountCode,
        cashflowType: classification.cashflowType,
        companyId: tx.companyId,
        isActive: true,
      },
    });
    // Notify controller: "I've learned a new rule: [description]. Want to activate it?"
  }
}
```
