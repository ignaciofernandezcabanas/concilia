"use client";

import { LABELS } from "@/lib/i18n/enums";

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
  // Journal entry
  POSTED: "bg-green-light text-green-text",
  DRAFT: "bg-amber-light text-amber-text",
  REVERSED: "bg-hover text-text-secondary",
};

export default function Badge({ value, label }: { value: string; label?: string }) {
  const style = STATUS_STYLES[value] || "bg-hover text-text-secondary";
  const text = label || LABELS[value] || value;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${style}`}>{text}</span>;
}
