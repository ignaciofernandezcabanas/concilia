/**
 * Centralized enum label translations for UI rendering.
 * All enum values displayed in components MUST use these maps.
 * Never render raw enum strings (e.g. "PENDING") in TSX.
 */

// ─── Bank Transaction Status ───
export const BANK_TRANSACTION_STATUS: Record<string, string> = {
  PENDING: "Pendiente",
  RECONCILED: "Conciliado",
  CLASSIFIED: "Clasificado",
  REJECTED: "Rechazado",
  INVESTIGATING: "En investigación",
  INTERNAL: "Transferencia interna",
  DUPLICATE: "Duplicado",
  IGNORED: "Ignorado",
};

// ─── Transaction Priority ───
export const TRANSACTION_PRIORITY: Record<string, string> = {
  URGENT: "Urgente",
  DECISION: "Decisión",
  CONFIRMATION: "Confirmación",
  ROUTINE: "Rutina",
};

// ─── Detected Type (reconciliation engine output) ───
export const DETECTED_TYPE: Record<string, string> = {
  MATCH_SIMPLE: "Cobro/pago directo",
  MATCH_GROUPED: "Agrupado",
  MATCH_PARTIAL: "Parcial",
  MATCH_DIFFERENCE: "Con diferencia",
  EXPENSE_NO_INVOICE: "Gasto sin factura",
  INTERNAL_TRANSFER: "Transferencia interna",
  INTERCOMPANY: "Intercompañía",
  FINANCIAL_OPERATION: "Op. financiera",
  UNIDENTIFIED: "No identificado",
  POSSIBLE_DUPLICATE: "Posible duplicado",
  RETURN: "Devolución",
  OVERDUE_INVOICE: "Factura vencida",
  CREDIT_NOTE: "Nota de crédito",
  PAYROLL: "Nómina detectada",
};

// ─── Detected Type (verbose — for ReconciliationPanel explanations) ───
export const DETECTED_TYPE_VERBOSE: Record<string, string> = {
  MATCH_SIMPLE: "Cobro/pago que coincide con una factura",
  MATCH_GROUPED: "Cobro/pago agrupado de varias facturas",
  MATCH_PARTIAL: "Cobro/pago parcial",
  MATCH_DIFFERENCE: "Cobro/pago con diferencia de importe",
  EXPENSE_NO_INVOICE: "Gasto sin factura asociada",
  INTERNAL_TRANSFER: "Transferencia interna entre cuentas propias",
  INTERCOMPANY: "Transferencia intercompañía detectada",
  POSSIBLE_DUPLICATE: "Posible duplicado detectado",
  RETURN: "Posible devolución",
  FINANCIAL_OPERATION: "Operación financiera recurrente",
  UNIDENTIFIED: "Movimiento no identificado",
  OVERDUE_INVOICE: "Factura vencida sin cobro",
  CREDIT_NOTE: "Nota de crédito",
  PAYROLL: "Nómina detectada",
};

// ─── Reconciliation Status ───
export const RECONCILIATION_STATUS: Record<string, string> = {
  PROPOSED: "Propuesta",
  AUTO_APPROVED: "Aprobada automáticamente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  NEEDS_REVIEW: "En revisión",
  PENDING_CLARIFICATION: "Pendiente aclaración",
};

// ─── Invoice Status ───
export const INVOICE_STATUS: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcialmente pagada",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  PROVISIONED: "En provisión",
  WRITTEN_OFF: "Fallida",
  CANCELLED: "Cancelada",
};

// ─── Invoice Type ───
export const INVOICE_TYPE: Record<string, string> = {
  ISSUED: "Emitida",
  RECEIVED: "Recibida",
  CREDIT_ISSUED: "NC Emitida",
  CREDIT_RECEIVED: "NC Recibida",
};

// ─── Difference Type (match with difference) ───
export const DIFFERENCE_TYPE: Record<string, string> = {
  EARLY_PAYMENT_DISCOUNT: "Descuento pronto pago",
  BANK_COMMISSION: "Comisión bancaria",
  WITHHOLDING_TAX: "Retención IRPF",
  PARTIAL_WRITE_OFF: "Pérdida parcial",
  FX_DIFFERENCE: "Diferencia de cambio",
  OVERPAYMENT_ADVANCE: "Anticipo",
  PENDING_CREDIT_NOTE: "Nota de crédito pendiente",
  NEGOTIATED_ADJUSTMENT: "Ajuste negociado",
  REQUEST_CLARIFICATION: "Solicitar aclaración",
  // Simplified labels used in ReconciliationPanel
  EARLY_PAYMENT: "Descuento por pronto pago",
  COMMERCIAL_DISCOUNT: "Descuento comercial",
  PARTIAL_PAYMENT: "Pago parcial",
  OTHER: "Otro motivo",
};

// ─── Journal Entry Type ───
export const JOURNAL_ENTRY_TYPE: Record<string, string> = {
  MANUAL: "Manual",
  AUTO_RECONCILIATION: "Conciliación automática",
  AUTO_DEPRECIATION: "Amortización automática",
  CLOSING: "Cierre",
  OPENING: "Apertura",
  ADJUSTMENT: "Ajuste",
};

// ─── Journal Entry Status ───
export const JOURNAL_ENTRY_STATUS: Record<string, string> = {
  POSTED: "Contabilizado",
  DRAFT: "Borrador",
  REVERSED: "Revertido",
};

// ─── Follow-up Action (seguimientos chat history) ───
export const FOLLOWUP_ACTION: Record<string, string> = {
  close: "Seguimiento cerrado",
  close_no_action: "Cerrado sin acción",
  wait: "En espera de confirmación",
  request_reference: "Referencia de pedido solicitada",
  register_advance: "Registrado como anticipo",
};

// ─── Follow-up Scenario (AgentThread) ───
export const FOLLOWUP_SCENARIO: Record<string, string> = {
  OVERDUE_RECEIVABLE: "Cobro pendiente",
  DUPLICATE_OR_OVERPAYMENT: "Cobro duplicado",
  SUPPLIER_DISCREPANCY: "Discrepancia proveedor",
  MISSING_FISCAL_DOCS: "Doc. fiscal faltante",
  GESTORIA_RECONCILIATION: "Gestoría",
  BANK_RETURN: "Devolución bancaria",
  UNIDENTIFIED_ADVANCE: "Anticipo sin identificar",
  INTERCOMPANY: "Intercompañía",
};

// ─── Thread Status ───
export const THREAD_STATUS: Record<string, string> = {
  AGENT_WORKING: "Agente trabajando",
  WAITING_EXTERNAL: "Esperando respuesta",
  WAITING_CONTROLLER: "Requiere decisión",
  RESOLVED: "Resuelto",
  STALE: "Sin actividad",
};

// ─── Thread Priority ───
export const THREAD_PRIORITY: Record<string, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Medio",
  LOW: "Bajo",
};

// ─── Message Role ───
export const MESSAGE_ROLE: Record<string, string> = {
  SYSTEM: "Sistema",
  AGENT: "Agente",
  EXTERNAL: "Respuesta externa",
  CONTROLLER: "Tú",
};

// ─── Investment Type ───
export const INVESTMENT_TYPE: Record<string, string> = {
  EQUITY_SUBSIDIARY: "Filial (>50%)",
  EQUITY_ASSOCIATE: "Asociada (20-50%)",
  EQUITY_OTHER: "Participación (<20%)",
  DEBT_INSTRUMENT: "Deuda/Bonos",
  LOAN_GRANTED: "Préstamo concedido",
  FUND: "Fondo de inversión",
};

// ─── Investment Transaction Type ───
export const INVESTMENT_TX_TYPE: Record<string, string> = {
  ACQUISITION: "Adquisición",
  PARTIAL_DIVESTMENT: "Desinversión parcial",
  FULL_DIVESTMENT: "Desinversión total",
  DIVIDEND_RECEIVED: "Dividendo cobrado",
  INTEREST_RECEIVED: "Interés cobrado",
  CAPITAL_CALL: "Llamada de capital",
  RETURN_OF_CAPITAL: "Devolución de capital",
  VALUATION_ADJUSTMENT: "Ajuste valoración",
  IMPAIRMENT: "Deterioro",
};

// ─── Debt Instrument Type ───
export const DEBT_TYPE: Record<string, string> = {
  TERM_LOAN: "Préstamo",
  REVOLVING_CREDIT: "Póliza crédito",
  DISCOUNT_LINE: "Línea descuento",
  CONFIRMING: "Confirming",
  FINANCE_LEASE: "Leasing",
  OVERDRAFT: "Descubierto",
  GUARANTEE: "Aval",
};

// ─── Debt Status ───
export const DEBT_STATUS: Record<string, string> = {
  ACTIVE: "Activo",
  MATURED: "Vencido",
  REFINANCED: "Refinanciado",
  DEFAULT: "Default",
};

// ─── Debt Transaction Type ───
export const DEBT_TX_TYPE: Record<string, string> = {
  DRAWDOWN: "Disposición",
  REPAYMENT: "Amortización",
  INSTALLMENT_PRINCIPAL: "Cuota principal",
  INSTALLMENT_INTEREST: "Cuota interés",
  INTEREST_PAYMENT: "Pago intereses",
  COMMISSION: "Comisión",
  RECLASSIFICATION_LP_CP: "Reclasificación LP→CP",
  COVENANT_CHECK: "Revisión covenant",
};

// ─── Debt Frequency ───
export const DEBT_FREQUENCY: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  ON_DEMAND: "A demanda",
};

// ─── Covenant Operator ───
export const COVENANT_OPERATOR: Record<string, string> = {
  LT: "<",
  LTE: "≤",
  GT: ">",
  GTE: "≥",
};

// ─── Bad Debt Status ───
export const BAD_DEBT_STATUS: Record<string, string> = {
  MONITORING: "Monitorizando",
  PROVISION_ACCOUNTING: "Prov. contable",
  PROVISION_TAX: "Prov. fiscal",
  RECOVERED: "Recuperado",
  WRITTEN_OFF: "Fallido",
};

// ─── Reconciliation Action Labels ───
export const RECONCILIATION_ACTION: Record<string, string> = {
  approve: "Match aprobado",
  reject: "Match rechazado",
  classify: "Transacción clasificada",
  mark_internal: "Transferencia interna confirmada",
  mark_duplicate: "Duplicado confirmado",
  mark_legitimate: "Marcada como legítima",
  mark_return: "Devolución confirmada",
  ignore: "Transacción ignorada",
  manual_match: "Match manual creado",
};

// ─── General Status (reusable for integrations, users, etc.) ───
export const GENERAL_STATUS: Record<string, string> = {
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  ERROR: "Error",
  ACTIVE: "Activo",
  DISABLED: "Deshabilitado",
};

// ─── Consolidated LABELS map (superset for Badge component) ───
export const LABELS: Record<string, string> = {
  // Invoice
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Cobrada",
  OVERDUE: "Vencida",
  PROVISIONED: "Provisionada",
  WRITTEN_OFF: "Incobrable",
  CANCELLED: "Anulada",
  // Transaction
  RECONCILED: "Conciliado",
  CLASSIFIED: "Clasificado",
  REJECTED: "Rechazado",
  INVESTIGATING: "Investigar",
  INTERNAL: "Interno",
  DUPLICATE: "Duplicado",
  IGNORED: "Ignorado",
  // Priority
  URGENT: "Urgente",
  DECISION: "Decisión",
  CONFIRMATION: "Confirmar",
  ROUTINE: "Rutina",
  // Integration
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  ERROR: "Error",
  // User
  ACTIVE: "Activo",
  DISABLED: "Deshabilitado",
  // Invoice type
  ISSUED: "Emitida",
  RECEIVED: "Recibida",
  CREDIT_ISSUED: "NC Emitida",
  CREDIT_RECEIVED: "NC Recibida",
  // Detected type
  MATCH_SIMPLE: "Match",
  MATCH_GROUPED: "Match agrupado",
  MATCH_PARTIAL: "Parcial",
  MATCH_DIFFERENCE: "Diferencia",
  EXPENSE_NO_INVOICE: "Sin factura",
  INTERNAL_TRANSFER: "Interno",
  POSSIBLE_DUPLICATE: "Duplicado",
  UNIDENTIFIED: "Sin identificar",
  FINANCIAL_OPERATION: "Financiero",
  RETURN: "Devolución",
  OVERDUE_INVOICE: "Vencido",
  CREDIT_NOTE: "Abono",
  // Journal entry
  POSTED: "Contabilizado",
  DRAFT: "Borrador",
  REVERSED: "Revertido",
  MANUAL: "Manual",
  AUTO_RECONCILIATION: "Conciliación auto.",
  AUTO_DEPRECIATION: "Amortización auto.",
  CLOSING: "Cierre",
  OPENING: "Apertura",
  ADJUSTMENT: "Ajuste",
};

/**
 * Generic translation helper with fallback to raw key.
 * Usage: t(BANK_TRANSACTION_STATUS, transaction.status)
 */
export function t(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key;
}
