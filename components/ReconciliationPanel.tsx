"use client";

import { useState, useEffect } from "react";
import { X, Check, AlertTriangle, Search, ArrowRight } from "lucide-react";
import Badge from "@/components/Badge";
import { api, qs } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import type { BankTransactionResponse } from "@/lib/types/api";

interface Props {
  tx: BankTransactionResponse;
  onResolve: (payload: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  resolving: boolean;
}

// ── Detected type labels ──
const TYPE_LABELS: Record<string, string> = {
  MATCH_SIMPLE: "Cobro/pago que coincide con una factura",
  MATCH_GROUPED: "Cobro/pago agrupado de varias facturas",
  MATCH_PARTIAL: "Cobro/pago parcial",
  MATCH_DIFFERENCE: "Cobro/pago con diferencia de importe",
  EXPENSE_NO_INVOICE: "Gasto sin factura asociada",
  INTERNAL_TRANSFER: "Transferencia interna entre cuentas propias",
  POSSIBLE_DUPLICATE: "Posible duplicado detectado",
  RETURN: "Posible devolución",
  FINANCIAL_OPERATION: "Operación financiera recurrente",
  UNIDENTIFIED: "Movimiento no identificado",
  OVERDUE_INVOICE: "Factura vencida sin cobro",
  CREDIT_NOTE: "Nota de crédito",
};

const DIFF_LABELS: Record<string, string> = {
  BANK_COMMISSION: "Comisión bancaria",
  EARLY_PAYMENT: "Descuento por pronto pago",
  COMMERCIAL_DISCOUNT: "Descuento comercial",
  PARTIAL_PAYMENT: "Pago parcial",
  OTHER: "Otro motivo",
};

export default function ReconciliationPanel({ tx, onResolve, onClose, resolving }: Props) {
  const reco = tx.reconciliation;
  const [createRule, setCreateRule] = useState(false);
  const [showClassify, setShowClassify] = useState(false);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const txType = tx.amount > 0 ? "Cobro" : "Pago";
  const confidence = reco?.confidenceScore ?? 0;
  const confidencePct = Math.round(confidence * 100);
  const hasMatch = reco && reco.invoiceId;

  // Confidence bar color
  const barColor = confidence >= 0.90 ? "bg-green" : confidence >= 0.70 ? "bg-amber" : "bg-red";
  const borderColor = confidence >= 0.90 ? "border-l-green" : confidence >= 0.70 ? "border-l-amber" : "border-l-subtle";

  return (
    <div className="w-[400px] min-w-[400px] bg-white border-l border-subtle flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-subtle shrink-0">
        <span className="text-[14px] font-semibold text-text-primary">Detalle de conciliación</span>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary"><X size={18} /></button>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-auto">
        {/* Block 1 — Context */}
        <div className="bg-context rounded-lg p-4">
          <h3 className="text-[14px] font-semibold text-text-primary mb-2">{txType} recibido</h3>
          <p className="text-[12px] text-text-secondary mb-3">
            {tx.detectedType ? TYPE_LABELS[tx.detectedType] ?? tx.detectedType : "Movimiento bancario pendiente de revisión."}
          </p>
          <div className="flex flex-col gap-1.5 text-[12px]">
            <Row label="Fecha" value={formatDate(tx.valueDate)} />
            <Row label="Concepto" value={tx.conceptParsed || tx.concept || "—"} />
            <Row label="Importe" value={formatAmount(tx.amount)} valueClass={tx.amount >= 0 ? "text-green-text" : "text-red-text"} />
            {tx.counterpartName && <Row label="Contrapartida" value={tx.counterpartName} />}
            {tx.counterpartIban && <Row label="IBAN" value={tx.counterpartIban} />}
          </div>
        </div>

        {/* Block 2 — System proposal */}
        {reco && (
          <div className={`rounded-lg p-4 border-l-[3px] ${borderColor}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-text-secondary">
                {confidencePct}% confianza
              </span>
              <div className="flex-1 h-1.5 bg-subtle rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${confidencePct}%` }} />
              </div>
            </div>

            {/* Matched invoice */}
            {reco.invoice && (
              <div className="bg-page rounded p-3 mb-3 text-[12px]">
                <div className="flex justify-between mb-1">
                  <span className="text-text-secondary">Factura</span>
                  <span className="font-medium text-accent">{reco.invoice.number}</span>
                </div>
                {reco.invoice.contact?.name && (
                  <div className="flex justify-between mb-1">
                    <span className="text-text-secondary">Cliente</span>
                    <span className="text-text-primary">{reco.invoice.contact.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-secondary">Importe</span>
                  <span className="font-mono text-text-primary">{formatAmount(reco.invoice.totalAmount)}</span>
                </div>
              </div>
            )}

            {/* Difference */}
            {reco.difference != null && reco.difference !== 0 && (
              <div className="text-[12px] mb-2">
                <span className="text-text-secondary">Diferencia: </span>
                <span className="font-mono font-medium text-amber-text">{formatAmount(reco.difference)}</span>
                {reco.differenceReason && (
                  <span className="text-text-tertiary"> — {DIFF_LABELS[reco.differenceReason] ?? reco.differenceReason}</span>
                )}
              </div>
            )}

            {/* Match reason */}
            <p className="text-[11px] text-text-tertiary italic">
              Match: {reco.matchReason?.split(":")[0] ?? "—"}
            </p>

            {/* LLM explanation */}
            {reco.resolution && (
              <div className="mt-3 p-3 bg-accent-light/30 rounded text-[12px] text-text-primary">
                {reco.resolution}
              </div>
            )}
          </div>
        )}

        {/* Block 3 — Actions */}
        <div className="flex flex-col gap-2">
          {/* Approve */}
          {hasMatch && (
            <button
              onClick={() => onResolve({ action: "approve", reconciliationId: reco!.id, createRule })}
              disabled={resolving}
              className="w-full h-9 bg-green text-white text-[13px] font-medium rounded-md hover:bg-green-text disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check size={14} />
              Aprobar {tx.detectedType === "MATCH_GROUPED" ? "match agrupado" : "cobro"}
            </button>
          )}

          {/* Reject */}
          {reco && !showReject && (
            <button
              onClick={() => setShowReject(true)}
              className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-text-primary hover:bg-hover"
            >
              Rechazar
            </button>
          )}
          {showReject && (
            <div className="flex flex-col gap-2 p-3 border border-subtle rounded-md">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo..."
                className="h-8 px-3 text-[12px] border border-subtle rounded"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (rejectReason.trim()) {
                      onResolve({ action: "reject", reconciliationId: reco!.id, reason: rejectReason });
                    }
                  }}
                  disabled={!rejectReason.trim() || resolving}
                  className="flex-1 h-8 bg-red text-white text-[12px] font-medium rounded disabled:opacity-50"
                >
                  Confirmar rechazo
                </button>
                <button onClick={() => setShowReject(false)} className="h-8 px-3 text-[12px] text-text-secondary border border-subtle rounded">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Type-specific actions */}
          {tx.detectedType === "POSSIBLE_DUPLICATE" && reco && (
            <>
              <button
                onClick={() => onResolve({ action: "mark_duplicate", bankTransactionId: tx.id })}
                disabled={resolving}
                className="w-full h-9 border border-red text-red text-[13px] font-medium rounded-md hover:bg-red-light disabled:opacity-50"
              >
                Confirmar duplicado
              </button>
              <button
                onClick={() => onResolve({ action: "mark_legitimate", duplicateGroupId: (tx as Record<string, unknown>).duplicateGroupId as string })}
                disabled={resolving}
                className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-text-primary hover:bg-hover disabled:opacity-50"
              >
                Marcar como legítimo
              </button>
            </>
          )}

          {tx.detectedType === "INTERNAL_TRANSFER" && (
            <button
              onClick={() => onResolve({ action: "mark_internal", bankTransactionId: tx.id })}
              disabled={resolving}
              className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-text-primary hover:bg-hover disabled:opacity-50"
            >
              Confirmar transferencia interna
            </button>
          )}

          {tx.detectedType === "RETURN" && reco && (
            <button
              onClick={() => onResolve({ action: "mark_return", reconciliationId: reco.id })}
              disabled={resolving}
              className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-text-primary hover:bg-hover disabled:opacity-50"
            >
              Confirmar devolución
            </button>
          )}

          {/* Classify manually */}
          {!showClassify ? (
            <button
              onClick={() => setShowClassify(true)}
              className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-text-primary hover:bg-hover"
            >
              Clasificar manualmente
            </button>
          ) : (
            <AccountPicker
              bankTransactionId={tx.id}
              onSelect={(accountCode, cashflowType) => {
                onResolve({ action: "classify", bankTransactionId: tx.id, accountCode, cashflowType, createRule });
              }}
              onCancel={() => setShowClassify(false)}
              resolving={resolving}
            />
          )}

          {/* Manual match */}
          {!hasMatch && !showManualMatch && (
            <button
              onClick={() => setShowManualMatch(true)}
              className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-accent hover:bg-accent-light"
            >
              Asignar a factura →
            </button>
          )}
          {showManualMatch && (
            <InvoicePicker
              isIncome={tx.amount > 0}
              onSelect={(invoiceId) => {
                onResolve({ action: "manual_match", bankTransactionId: tx.id, invoiceId });
              }}
              onCancel={() => setShowManualMatch(false)}
              resolving={resolving}
            />
          )}

          {/* Ignore */}
          <button
            onClick={() => onResolve({ action: "ignore", bankTransactionId: tx.id, reason: "Ignorado por el controller" })}
            disabled={resolving}
            className="w-full h-8 text-[12px] text-text-tertiary hover:text-text-secondary"
          >
            Ignorar movimiento
          </button>
        </div>

        {/* Block 4 — Create rule checkbox */}
        {(hasMatch || showClassify) && (
          <label className="flex items-center gap-2 p-3 border border-subtle rounded-md cursor-pointer">
            <input type="checkbox" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} className="rounded border-subtle" />
            <span className="text-[12px] text-text-secondary">Recordar esta decisión para el futuro</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function Row({ label, value, valueClass = "text-text-primary" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-medium ${valueClass} text-right max-w-[200px] truncate`}>{value}</span>
    </div>
  );
}

function AccountPicker({ bankTransactionId, onSelect, onCancel, resolving }: {
  bankTransactionId: string;
  onSelect: (accountCode: string, cashflowType: string) => void;
  onCancel: () => void;
  resolving: boolean;
}) {
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<{ code: string; name: string; cashflowType: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<{ accounts: typeof accounts }>(`/api/settings/accounts${qs({ search })}`)
      .then((res) => setAccounts(res.accounts))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="border border-subtle rounded-md p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Search size={12} className="text-text-tertiary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cuenta PGC..."
          className="flex-1 h-7 text-[12px] border-none outline-none placeholder:text-text-tertiary"
        />
      </div>
      <div className="max-h-40 overflow-auto">
        {loading ? (
          <p className="text-[11px] text-text-tertiary p-2">Buscando...</p>
        ) : accounts.length === 0 ? (
          <p className="text-[11px] text-text-tertiary p-2">Sin resultados</p>
        ) : (
          accounts.map((acc) => (
            <button
              key={acc.code}
              onClick={() => onSelect(acc.code, acc.cashflowType ?? "OPERATING")}
              disabled={resolving}
              className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-hover rounded flex justify-between disabled:opacity-50"
            >
              <span className="font-mono text-accent">{acc.code}</span>
              <span className="text-text-secondary truncate ml-2">{acc.name}</span>
            </button>
          ))
        )}
      </div>
      <button onClick={onCancel} className="text-[11px] text-text-tertiary hover:text-text-secondary self-start">
        Cancelar
      </button>
    </div>
  );
}

function InvoicePicker({ isIncome, onSelect, onCancel, resolving }: {
  isIncome: boolean;
  onSelect: (invoiceId: string) => void;
  onCancel: () => void;
  resolving: boolean;
}) {
  const [invoices, setInvoices] = useState<{ id: string; number: string; totalAmount: number; contact?: { name: string } | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const type = isIncome ? "ISSUED" : "RECEIVED";
    api.get<{ data: typeof invoices }>(`/api/invoices${qs({ type, status: "PENDING", pageSize: 20 })}`)
      .then((res) => setInvoices(res.data))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [isIncome]);

  return (
    <div className="border border-subtle rounded-md p-3 flex flex-col gap-2">
      <span className="text-[11px] font-medium text-text-secondary">Facturas {isIncome ? "emitidas" : "recibidas"} pendientes:</span>
      <div className="max-h-40 overflow-auto">
        {loading ? (
          <p className="text-[11px] text-text-tertiary p-2">Cargando...</p>
        ) : invoices.length === 0 ? (
          <p className="text-[11px] text-text-tertiary p-2">Sin facturas pendientes</p>
        ) : (
          invoices.map((inv) => (
            <button
              key={inv.id}
              onClick={() => onSelect(inv.id)}
              disabled={resolving}
              className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-hover rounded flex justify-between disabled:opacity-50"
            >
              <span>
                <span className="font-medium text-accent">{inv.number}</span>
                {inv.contact?.name && <span className="text-text-secondary ml-1">— {inv.contact.name}</span>}
              </span>
              <span className="font-mono text-text-primary">{formatAmount(inv.totalAmount)}</span>
            </button>
          ))
        )}
      </div>
      <button onClick={onCancel} className="text-[11px] text-text-tertiary hover:text-text-secondary self-start">
        Cancelar
      </button>
    </div>
  );
}
