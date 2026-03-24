# Close Process Reference — Concilia

## Period Close Workflow

Concilia manages period close at company level. A period can only be closed when
all conditions are met. This prevents financial data corruption.

### Close Preconditions (ALL must be true)

```typescript
interface CloseChecklist {
  // Hard blockers — period CANNOT close until resolved
  allTransactionsReconciled: boolean; // No PENDING bankTransactions in period
  noUnclassifiedItems: boolean; // No items on account 555
  bankReconciliationBalances: boolean; // GL 572 === bank statement balance
  icBalancesMatch: boolean; // If multi-entity: IC positions net to zero
  noOpenDuplicateGroups: boolean; // All duplicate groups resolved

  // Soft blockers — warn but allow close with override
  allMaterialVariancesCommented: boolean; // Variances > threshold have commentary
  allInvoicesMatched: boolean; // No orphan invoices in period
  accrualReviewCompleted: boolean; // Manual confirmation
  taxReconciliationDone: boolean; // IVA/IRPF accounts reconciled
}

function canClosePeriod(checklist: CloseChecklist): {
  canClose: boolean;
  hardBlockers: string[];
  softBlockers: string[];
} {
  const hardBlockers = [];
  const softBlockers = [];

  if (!checklist.allTransactionsReconciled)
    hardBlockers.push("Hay movimientos bancarios pendientes de conciliar");
  if (!checklist.noUnclassifiedItems)
    hardBlockers.push("Hay partidas en cuenta 555 (pendientes de clasificar)");
  if (!checklist.bankReconciliationBalances)
    hardBlockers.push("El saldo contable no cuadra con el extracto bancario");
  if (!checklist.icBalancesMatch) hardBlockers.push("Los saldos intercompañía no coinciden");
  if (!checklist.noOpenDuplicateGroups) hardBlockers.push("Hay grupos de duplicados sin resolver");

  if (!checklist.allMaterialVariancesCommented)
    softBlockers.push("Faltan comentarios en variaciones materiales");
  if (!checklist.allInvoicesMatched)
    softBlockers.push("Hay facturas sin movimiento bancario asociado");
  if (!checklist.accrualReviewCompleted) softBlockers.push("Revisión de provisiones no confirmada");
  if (!checklist.taxReconciliationDone) softBlockers.push("Reconciliación fiscal no completada");

  return {
    canClose: hardBlockers.length === 0,
    hardBlockers,
    softBlockers,
  };
}
```

### Close Actions (when controller confirms close)

1. Lock period: no new transactions, reconciliations, or classifications allowed
   (except with ADMIN override + audit log entry)
2. Generate period-end reports: P&L, balance sheet, cashflow, bank reconciliation
3. Snapshot balances: store period-end balances for each account (used as opening balances
   for next period and for variance analysis)
4. Update dashboards: recalculate all KPIs and refresh cached data
5. Create close log entry with timestamp, user, checklist status, overrides if any

### Reopen Period

Only ADMIN role can reopen a closed period. When reopened:

- All locks are removed
- A prominent warning banner shows "PERIOD REOPENED — changes affect closed reporting"
- Every change made during reopen is tagged in audit log
- When re-closed, a comparison report shows what changed vs original close
- Downstream periods may need adjustment (cascade warning)

## Fiscal Calendar — Spain

Track these obligations per period:

### Monthly (if applicable)

- Modelo 111: retenciones IRPF empleados/profesionales → 20 del mes siguiente
- Modelo 115: retenciones alquileres → 20 del mes siguiente

### Quarterly

- Modelo 303: IVA trimestral → 20 del mes siguiente al trimestre (abril, julio, octubre, enero)
- Modelo 130: pago fraccionado IRPF autónomos → mismas fechas que 303
- Modelo 202: pago fraccionado IS → abril, octubre, diciembre

### Annual

- Modelo 390: resumen anual IVA → 30 enero
- Modelo 190: resumen retenciones → 31 enero
- Modelo 347: operaciones >3.005,06€ → 28 febrero
- Modelo 200: Impuesto sobre Sociedades → 25 julio
- Modelo 349: operaciones intracomunitarias → 30 del mes siguiente al trimestre
- Cuentas anuales: depósito en Registro Mercantil → 30 julio (plazo general)

### Concilia Implementation

Store obligations in the database:

```typescript
// Create obligation entries at start of fiscal year
// Track: modelo, period, deadline, status (pending/filed/paid), amount
// Dashboard shows upcoming deadlines sorted by date
// Alerts: 7 days before deadline, 1 day before, overdue
```
