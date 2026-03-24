"use client";

const STATUS_STYLES: Record<string, string> = {
  // Invoice statuses
  PENDING: "bg-amber-light text-amber-text",
  PARTIAL: "bg-amber-light text-amber-text",
  PAID: "bg-green-light text-green-text",
  OVERDUE: "bg-red-light text-red-text",
  PROVISIONED: "bg-purple-light text-purple",
  WRITTEN_OFF: "bg-red-light text-red-text",
  CANCELLED: "bg-hover text-text-secondary",
  // Transaction statuses
  RECONCILED: "bg-green-light text-green-text",
  CLASSIFIED: "bg-green-light text-green-text",
  REJECTED: "bg-red-light text-red-text",
  INVESTIGATING: "bg-purple-light text-purple",
  INTERNAL: "bg-hover text-text-secondary",
  DUPLICATE: "bg-red-light text-red-text",
  IGNORED: "bg-hover text-text-secondary",
  // Priority
  URGENT: "bg-red-light text-red-text",
  DECISION: "bg-amber-light text-amber-text",
  CONFIRMATION: "bg-accent-light text-accent",
  ROUTINE: "bg-hover text-text-secondary",
  // Integration
  CONNECTED: "bg-green-light text-green-text",
  DISCONNECTED: "bg-hover text-text-secondary",
  ERROR: "bg-red-light text-red-text",
  // User status
  ACTIVE: "bg-green-light text-green-text",
  DISABLED: "bg-hover text-text-secondary",
  // Detected types
  MATCH_SIMPLE: "bg-green-light text-green-text",
  MATCH_GROUPED: "bg-green-light text-green-text",
  MATCH_PARTIAL: "bg-amber-light text-amber-text",
  MATCH_DIFFERENCE: "bg-amber-light text-amber-text",
  EXPENSE_NO_INVOICE: "bg-red-light text-red-text",
  INTERNAL_TRANSFER: "bg-hover text-text-secondary",
  POSSIBLE_DUPLICATE: "bg-red-light text-red-text",
  UNIDENTIFIED: "bg-purple-light text-purple",
};

const LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Cobrada",
  OVERDUE: "Vencida",
  PROVISIONED: "Provisionada",
  WRITTEN_OFF: "Incobrable",
  CANCELLED: "Anulada",
  RECONCILED: "Conciliado",
  CLASSIFIED: "Clasificado",
  REJECTED: "Rechazado",
  INVESTIGATING: "Investigar",
  INTERNAL: "Interno",
  DUPLICATE: "Duplicado",
  IGNORED: "Ignorado",
  URGENT: "Urgente",
  DECISION: "Decisión",
  CONFIRMATION: "Confirmar",
  ROUTINE: "Rutina",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  ERROR: "Error",
  ACTIVE: "Activo",
  DISABLED: "Deshabilitado",
  ISSUED: "Emitida",
  RECEIVED: "Recibida",
  CREDIT_ISSUED: "NC Emitida",
  CREDIT_RECEIVED: "NC Recibida",
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
};

export default function Badge({ value, label }: { value: string; label?: string }) {
  const style = STATUS_STYLES[value] || "bg-hover text-text-secondary";
  const text = label || LABELS[value] || value;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${style}`}>{text}</span>;
}
