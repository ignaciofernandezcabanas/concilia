# Reporting Logic Reference — Concilia

## P&L — Cuenta de Pérdidas y Ganancias (PGC PYMEs)

Build the P&L by querying reconciled transactions grouped by PGC account ranges.
The 17 mandatory line items for PGC PYMEs:

```typescript
interface PyGLine {
  code: string; // PGC line code
  label: string; // Spanish label
  accountRange: string; // Which accounts to sum
  sign: 1 | -1; // 1 = natural, -1 = invert sign for presentation
}

const PYG_STRUCTURE: PyGLine[] = [
  // OPERACIONES CONTINUADAS
  { code: "1", label: "Importe neto cifra de negocios", accountRange: "700-705", sign: 1 },
  { code: "2", label: "Variación existencias PT y PC", accountRange: "610-612", sign: 1 },
  { code: "3", label: "Trabajos realizados para activo", accountRange: "730-733", sign: 1 },
  { code: "4", label: "Aprovisionamientos", accountRange: "600-609", sign: -1 },
  { code: "5", label: "Otros ingresos de explotación", accountRange: "740-759", sign: 1 },
  { code: "6", label: "Gastos de personal", accountRange: "640-649", sign: -1 },
  { code: "7", label: "Otros gastos de explotación", accountRange: "620-639,650-659", sign: -1 },
  { code: "8", label: "Amortización del inmovilizado", accountRange: "680-689", sign: -1 },
  { code: "9", label: "Imputación subvenciones inmovilizado", accountRange: "746", sign: 1 },
  { code: "10", label: "Excesos de provisiones", accountRange: "795-799", sign: 1 },
  {
    code: "11",
    label: "Deterioro y resultado enajenaciones",
    accountRange: "690-699,770-779",
    sign: 1,
  },
  // A1 = RESULTADO DE EXPLOTACIÓN = sum(1..11)

  { code: "12", label: "Ingresos financieros", accountRange: "760-769", sign: 1 },
  { code: "13", label: "Gastos financieros", accountRange: "660-669", sign: -1 },
  {
    code: "14",
    label: "Variaciones valor razonable instrumentos financieros",
    accountRange: "663,763",
    sign: 1,
  },
  { code: "15", label: "Diferencias de cambio", accountRange: "668,768", sign: 1 },
  {
    code: "16",
    label: "Deterioro y resultado enajenaciones financieras",
    accountRange: "696-699,796-799",
    sign: 1,
  },
  // A2 = RESULTADO FINANCIERO = sum(12..16)

  // A3 = RESULTADO ANTES DE IMPUESTOS = A1 + A2

  { code: "17", label: "Impuesto sobre beneficios", accountRange: "630-633", sign: -1 },
  // A4 = RESULTADO DEL EJERCICIO = A3 + 17
];
```

### Calculation Rules

- Query: `SELECT accountCode, SUM(amount) FROM reconciled_entries WHERE period = ? GROUP BY accountCode`
- Map each account to its PyG line using the accountRange
- Expenses (group 6) are stored as positive amounts but presented as negative in P&L
- Revenue (group 7) stored as positive, presented as positive
- Subtotals are calculated, never stored
- EBITDA (not a PGC line but required for management): A1 + line 8 (add back depreciation)

### Management vs Statutory Adjustments

When generating management P&L, allow add-backs:

```typescript
interface EBITDAAdjustment {
  description: string;
  amount: number;
  category: "NON_RECURRING" | "NON_CASH" | "OWNER_COMP" | "PRO_FORMA";
  isAddBack: boolean; // true = add to EBITDA, false = subtract
}

// Management EBITDA = Statutory EBITDA + sum(adjustments where isAddBack) - sum(where !isAddBack)
// ALWAYS show both statutory and adjusted side by side
// ALWAYS itemize each adjustment with description
```

## Cashflow

### Mode 1: Treasury (Direct Method — Dashboard)

Group bank transactions by cashflowType:

```
COBROS OPERATIVOS
  + Cobros de clientes (OPERATING_INCOME)
  + Otros cobros operativos
PAGOS OPERATIVOS
  - Pagos a proveedores (OPERATING_EXPENSE)
  - Nóminas y SS
  - Alquileres
  - Suministros
  - Otros gastos operativos
= FLUJO OPERATIVO NETO

INVERSIÓN
  - Compra de activos (INVESTING_OUTFLOW)
  + Venta de activos (INVESTING_INFLOW)
= FLUJO DE INVERSIÓN

FINANCIACIÓN
  + Disposición préstamos (FINANCING_INFLOW)
  - Amortización préstamos (FINANCING_OUTFLOW)
  - Pago intereses (FINANCING_OUTFLOW)
  - Dividendos (FINANCING_OUTFLOW)
= FLUJO DE FINANCIACIÓN

IMPUESTOS
  - IVA pagado (TAX)
  - Retenciones pagadas (TAX)
  - IS pagado (TAX)
  + Devoluciones recibidas (TAX)
= FLUJO FISCAL

MOVIMIENTO NETO = Operativo + Inversión + Financiación + Fiscal
SALDO INICIAL + MOVIMIENTO NETO = SALDO FINAL
```

Verify: SALDO FINAL must equal the bank balance at period-end.
If it doesn't, there are unclassified or missing transactions.

### Mode 2: EFE Formal (Indirect Method — Reporting)

```
RESULTADO DEL EJERCICIO (from P&L)
+ Amortizaciones (680-689)
+ Deterioros (690-699)
+/- Variación provisiones
+/- Variación capital circulante:
    +/- Variación deudores (430)
    +/- Variación existencias (300-399)
    +/- Variación acreedores (400)
= FLUJO EFECTIVO ACTIVIDADES EXPLOTACIÓN

- Pagos por inversiones (compra inmovilizado)
+ Cobros por desinversiones (venta inmovilizado)
= FLUJO EFECTIVO ACTIVIDADES INVERSIÓN

+ Cobros por emisión deuda
- Pagos por devolución deuda
- Pagos por dividendos
= FLUJO EFECTIVO ACTIVIDADES FINANCIACIÓN

AUMENTO/DISMINUCIÓN EFECTIVO = Explotación + Inversión + Financiación
EFECTIVO INICIO + AUMENTO = EFECTIVO FINAL
```

## Variance Analysis

### Format for P&L Variances

For each P&L line, calculate:

```typescript
interface Variance {
  lineCode: string;
  lineName: string;
  actual: number;
  budget: number;
  priorYear: number;
  varianceVsBudget: number;
  varianceVsBudgetPct: number;
  varianceVsPY: number;
  varianceVsPYPct: number;
  isMaterial: boolean; // exceeds materiality threshold
  commentary?: string; // LLM-generated or controller-entered
}
```

### Materiality for Variance Commentary

- Revenue lines: flag if variance > 5% or > €5,000
- Cost lines: flag if variance > 10% or > €2,000
- All lines: always flag if variance changes sign (profit → loss)
- Controller must add commentary for all material variances before close

## Reconciliation Report (Bank Rec)

Standard bank reconciliation format:

```
Saldo según banco (extracto):              €XX,XXX.XX
(-) Cheques/transferencias pendientes:      (€X,XXX.XX)
(+) Cobros pendientes de abono:             €X,XXX.XX
(+/-) Errores bancarios:                    €XXX.XX
= Saldo ajustado banco:                    €XX,XXX.XX

Saldo según libros (cuenta 572):           €XX,XXX.XX
(-) Comisiones no registradas:              (€XX.XX)
(+) Intereses no registrados:               €XX.XX
(+/-) Errores contables:                    €XXX.XX
= Saldo ajustado libros:                   €XX,XXX.XX

DIFERENCIA (debe ser CERO):                €0.00
```

If difference ≠ 0 → block period close, escalate to controller.
