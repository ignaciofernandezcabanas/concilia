// lib/ai/prompts/reconciliation.ts
// System prompt injected when calling Claude API for transaction matching
// Used by: lib/reconciliation/matchers/llm-matcher.ts (Stage 5 of pipeline)

export const RECONCILIATION_SYSTEM_PROMPT = `
Eres el motor de conciliación de una plataforma de controlling financiero.
Actúas como un controller senior con 20 años de experiencia.

Tu trabajo: dado un movimiento bancario y una lista de facturas candidatas,
determinar si alguna factura corresponde al movimiento.

## REGLAS ABSOLUTAS

1. Si no hay match claro, responde matchedInvoiceId: null. NUNCA fuerces un match.
2. Un match REQUIERE coherencia en al menos 2 de estos 3 criterios:
   - Importe (exacto o con diferencia justificable: descuento, comisión bancaria, redondeo)
   - Contacto (mismo proveedor/cliente por IBAN, nombre, o CIF)
   - Temporalidad (fecha factura ≤ fecha movimiento, diferencia razonable según plazo pago habitual)
3. Si la diferencia de importe > 5%, NO es match salvo que la diferencia sea exactamente
   un concepto identificable (IVA, retención IRPF, descuento por pronto pago).
4. Un pago parcial ES un match válido. Indica el importe aplicado y el pendiente.
5. Varios movimientos pueden corresponder a una factura (pagos parciales).
   Una factura puede corresponder a varios movimientos (agrupación).

## LÓGICA DE MATCHING

### Pagos recibidos (importe positivo en banco)
- Busca facturas EMITIDAS pendientes de cobro del mismo cliente
- Verifica: importe recibido = base + IVA - retención IRPF (si aplica)
- Si el cliente paga con retención 15%, el cobro será ~85% del total con IVA
  Ejemplo: factura 1.000€ + 210€ IVA - 150€ IRPF = 1.060€ cobro esperado

### Pagos realizados (importe negativo en banco)
- Busca facturas RECIBIDAS pendientes de pago al mismo proveedor
- Verifica: importe pagado = total factura (base + IVA)
- Si nosotros retenemos IRPF al proveedor, el pago será menor que el total
  Ejemplo: factura proveedor 1.000€ + 210€ IVA - 150€ IRPF = pagamos 1.060€

### Diferencias aceptables sin investigación
- ≤ 0.05€: redondeo
- Exactamente un % estándar de descuento (2%, 3%, 5%): pronto pago
- Pequeña comisión bancaria (0.1-0.5% del importe): transferencia internacional

### Señales de NO match (responde null)
- El concepto bancario no tiene relación con el contacto de la factura
- La factura es de un periodo muy anterior (>180 días) sin contexto que lo justifique
- El importe difiere >5% sin explicación clara
- La factura ya está pagada (status PAID)

## FORMATO DE RESPUESTA

Responde EXCLUSIVAMENTE en JSON válido, sin markdown, sin explicaciones fuera del JSON:

{
  "matchedInvoiceId": "string | null",
  "confidence": 0.00-1.00,
  "matchType": "EXACT | PARTIAL | GROUPED | NONE",
  "reasoning": "explicación breve de por qué es o no match",
  "differenceAmount": 0.00,
  "differenceReason": "string | null",
  "suggestedAccountCode": "string | null",
  "alerts": ["string"] 
}

Si matchedInvoiceId es null, sugiere una clasificación PGC en suggestedAccountCode
basándote en el concepto del movimiento y las reglas del Plan General Contable español.
`;

// Template for the user message sent alongside the system prompt
export function buildReconciliationUserMessage(params: {
  bankTransaction: {
    id: string;
    amount: number;
    valueDate: string;
    concept: string;
    counterpartName?: string;
    counterpartIban?: string;
  };
  candidateInvoices: Array<{
    id: string;
    number: string;
    type: "emitida" | "recibida";
    contactName: string;
    contactCif?: string;
    contactIban?: string;
    baseAmount: number;
    ivaAmount: number;
    irpfAmount: number;
    totalAmount: number;
    issueDate: string;
    dueDate: string;
    status: string;
    paidAmount: number;
  }>;
  recentPatterns?: Array<{
    concept: string;
    accountCode: string;
    contactName: string;
  }>;
}): string {
  const { bankTransaction, candidateInvoices, recentPatterns } = params;

  let message = `## MOVIMIENTO BANCARIO\n`;
  message += `ID: ${bankTransaction.id}\n`;
  message += `Importe: ${bankTransaction.amount}€ (${bankTransaction.amount > 0 ? "COBRO" : "PAGO"})\n`;
  message += `Fecha valor: ${bankTransaction.valueDate}\n`;
  message += `Concepto: ${bankTransaction.concept}\n`;
  if (bankTransaction.counterpartName)
    message += `Ordenante/Beneficiario: ${bankTransaction.counterpartName}\n`;
  if (bankTransaction.counterpartIban)
    message += `IBAN contrapartida: ${bankTransaction.counterpartIban}\n`;

  message += `\n## FACTURAS CANDIDATAS (${candidateInvoices.length})\n\n`;

  if (candidateInvoices.length === 0) {
    message += `No hay facturas candidatas. Clasifica el movimiento por su concepto.\n`;
  } else {
    for (const inv of candidateInvoices) {
      message += `- ID: ${inv.id} | Nº: ${inv.number} | Tipo: ${inv.type}\n`;
      message += `  Contacto: ${inv.contactName}${inv.contactCif ? ` (${inv.contactCif})` : ""}${inv.contactIban ? ` — IBAN: ${inv.contactIban}` : ""}\n`;
      message += `  Base: ${inv.baseAmount}€ + IVA: ${inv.ivaAmount}€ - IRPF: ${inv.irpfAmount}€ = Total: ${inv.totalAmount}€\n`;
      message += `  Emitida: ${inv.issueDate} | Vence: ${inv.dueDate} | Estado: ${inv.status} | Cobrado/Pagado: ${inv.paidAmount}€\n`;
      message += `  Pendiente: ${(inv.totalAmount - inv.paidAmount).toFixed(2)}€\n\n`;
    }
  }

  if (recentPatterns && recentPatterns.length > 0) {
    message += `\n## PATRONES RECIENTES APROBADOS (para referencia)\n`;
    for (const p of recentPatterns) {
      message += `- Concepto similar: "${p.concept}" → Cuenta ${p.accountCode} (${p.contactName})\n`;
    }
  }

  return message;
}
