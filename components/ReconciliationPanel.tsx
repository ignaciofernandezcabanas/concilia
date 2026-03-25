"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Check, Search, Eye, FileCheck } from "lucide-react";
import InvoicePdfModal from "@/components/InvoicePdfModal";
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
  INTERCOMPANY: "Transferencia intercompañía detectada",
  POSSIBLE_DUPLICATE: "Posible duplicado detectado",
  RETURN: "Posible devolución",
  FINANCIAL_OPERATION: "Operación financiera recurrente",
  UNIDENTIFIED: "Movimiento no identificado",
  OVERDUE_INVOICE: "Factura vencida sin cobro",
  CREDIT_NOTE: "Nota de crédito",
  PAYROLL: "Nómina detectada",
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
  const [viewingPdf, setViewingPdf] = useState<{ id: string; number: string } | null>(null);
  const [showCapexForm, setShowCapexForm] = useState(false);
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);
  const [capexForm, setCapexForm] = useState({
    name: "",
    assetAccountCode: "219",
    usefulLifeMonths: 60,
    residualValue: 0,
  });
  const [investForm, setInvestForm] = useState({
    name: "",
    type: "EQUITY_OTHER",
    pgcAccount: "250",
    isinCif: "",
    ownershipPct: 0,
  });
  const [pendingMatch, setPendingMatch] = useState<{
    invoiceId: string;
    invoiceAmount: number;
    invoiceNumber: string;
    difference: number;
  } | null>(null);
  const [selectedDiffType, setSelectedDiffType] = useState("");

  const txType = tx.amount > 0 ? "Cobro" : "Pago";
  const confidence = reco?.confidenceScore ?? 0;
  const confidencePct = Math.round(confidence * 100);
  const hasMatch = reco && reco.invoiceId;

  // Confidence bar color
  const barColor = confidence >= 0.9 ? "bg-green" : confidence >= 0.7 ? "bg-amber" : "bg-red";
  const borderColor =
    confidence >= 0.9 ? "border-l-green" : confidence >= 0.7 ? "border-l-amber" : "border-l-subtle";

  return (
    <div className="w-[400px] min-w-[400px] bg-white border-l border-subtle flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-subtle shrink-0">
        <span className="text-[14px] font-semibold text-text-primary">Detalle de conciliación</span>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-auto">
        {/* Block 1 — Context */}
        <div className="bg-context rounded-lg p-4">
          <h3 className="text-[14px] font-semibold text-text-primary mb-2">{txType} recibido</h3>
          <p className="text-[12px] text-text-secondary mb-3">
            {tx.detectedType
              ? (TYPE_LABELS[tx.detectedType] ?? tx.detectedType)
              : "Movimiento bancario pendiente de revisión."}
          </p>
          {/* Payroll badge */}
          {tx.detectedType === "PAYROLL" && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                Nomina
              </span>
              <span className="text-[11px] text-text-tertiary font-mono">Cuenta sugerida: 640</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5 text-[12px]">
            <Row label="Fecha" value={formatDate(tx.valueDate)} />
            <div className="flex justify-between">
              <span className="text-text-secondary shrink-0">Concepto</span>
              <span className="text-text-primary text-right max-w-[220px] break-words text-[11px]">
                {tx.concept || "—"}
              </span>
            </div>
            <Row
              label="Importe"
              value={formatAmount(tx.amount)}
              valueClass={tx.amount >= 0 ? "text-green-text" : "text-red-text"}
            />
            {tx.status && <Row label="Estado" value={tx.status} />}
          </div>
        </div>

        {/* Block — Counterparty */}
        {(tx.counterpartName || tx.counterpartIban) && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] text-text-tertiary uppercase font-semibold mb-2">
              Contrapartida
            </p>
            <div className="flex flex-col gap-1 text-[12px]">
              {tx.counterpartName && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Nombre</span>
                  <span className="text-text-primary font-medium">{tx.counterpartName}</span>
                </div>
              )}
              {tx.counterpartIban && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">IBAN</span>
                  <span className="text-text-primary font-mono text-[11px]">
                    {tx.counterpartIban}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Block 2 — System proposal */}
        {reco && (
          <div className={`rounded-lg p-4 border-l-[3px] ${borderColor}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-text-secondary">
                {confidencePct}% confianza
              </span>
              <div className="flex-1 h-1.5 bg-subtle rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${confidencePct}%` }}
                />
              </div>
            </div>

            {/* Matched invoice */}
            {reco.invoice && (
              <div className="bg-page rounded p-3 mb-3 text-[12px]">
                <div className="flex justify-between mb-1">
                  <span className="text-text-secondary">Factura</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-accent">{reco.invoice.number}</span>
                    <button
                      onClick={() =>
                        setViewingPdf({ id: reco.invoiceId!, number: reco.invoice!.number })
                      }
                      className="text-text-tertiary hover:text-accent transition-colors"
                      title="Ver factura PDF"
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
                {reco.invoice.contact?.name && (
                  <div className="flex justify-between mb-1">
                    <span className="text-text-secondary">Cliente</span>
                    <span className="text-text-primary">{reco.invoice.contact.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-secondary">Importe</span>
                  <span className="font-mono text-text-primary">
                    {formatAmount(reco.invoice.totalAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Difference */}
            {reco.difference != null && reco.difference !== 0 && (
              <div className="text-[12px] mb-2">
                <span className="text-text-secondary">Diferencia: </span>
                <span className="font-mono font-medium text-amber-text">
                  {formatAmount(reco.difference)}
                </span>
                {reco.differenceReason && (
                  <span className="text-text-tertiary">
                    {" "}
                    — {DIFF_LABELS[reco.differenceReason] ?? reco.differenceReason}
                  </span>
                )}
              </div>
            )}

            {/* Match reason — human-readable */}
            <p className="text-[11px] text-text-secondary">
              {(() => {
                const r = reco.matchReason ?? "";
                const key = r.split(":")[0];
                const reasonMap: Record<string, string> = {
                  exact_match: "Coincidencia exacta con factura",
                  fuzzy_match: "Coincidencia por concepto similar",
                  grouped_match: "Agrupación de múltiples facturas",
                  partial_match: "Pago parcial de factura",
                  difference_match: "Match con diferencia (comisión/descuento)",
                  internal_transfer: "Transferencia interna entre cuentas propias",
                  intercompany: "Operación intercompañía",
                  duplicate_detected: "Posible duplicado detectado",
                  return_detected: "Devolución detectada",
                  capex_detected: "CAPEX — compra de activo fijo",
                  investment_detected: "Inversión financiera detectada",
                  rule_match: "Regla de clasificación aplicada",
                  llm_classify: "Clasificación por IA",
                  llm_match: "Match propuesto por IA",
                };
                return reasonMap[key] ?? r;
              })()}
            </p>

            {/* LLM explanation */}
            {reco.resolution && (
              <div className="mt-3 p-3 bg-accent-light/30 rounded text-[12px] text-text-primary">
                {reco.resolution}
              </div>
            )}
          </div>
        )}

        {/* No reconciliation — guide the controller */}
        {!reco && tx.status === "PENDING" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">Sin propuesta de match</p>
            <p className="text-[11px] text-amber-600">
              El sistema no encontró una factura que corresponda a este movimiento. Puedes
              clasificarlo manualmente, buscar una factura, o ignorarlo.
            </p>
          </div>
        )}

        {/* PENDING_CLARIFICATION — waiting for external response */}
        {tx.status === "INVESTIGATING" && reco?.matchReason?.includes("pending_clarification") && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">Pendiente de aclaración</p>
            <p className="text-[11px] text-blue-600">
              Se ha solicitado aclaración al contacto sobre la diferencia de{" "}
              <span className="font-mono font-medium">
                {reco?.difference != null ? formatAmount(Math.abs(reco.difference)) : "—"}
              </span>
              .
            </p>
            <a
              href="/seguimientos"
              className="text-[11px] text-blue-700 hover:underline mt-1 inline-block font-medium"
            >
              Ver seguimiento del email →
            </a>
          </div>
        )}

        {/* Block 3 — Actions */}
        <div className="flex flex-col gap-2">
          {/* Approve */}
          {hasMatch && (
            <button
              onClick={() =>
                onResolve({ action: "approve", reconciliationId: reco!.id, createRule })
              }
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
                      onResolve({
                        action: "reject",
                        reconciliationId: reco!.id,
                        reason: rejectReason,
                      });
                    }
                  }}
                  disabled={!rejectReason.trim() || resolving}
                  className="flex-1 h-8 bg-red text-white text-[12px] font-medium rounded disabled:opacity-50"
                >
                  Confirmar rechazo
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="h-8 px-3 text-[12px] text-text-secondary border border-subtle rounded"
                >
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
                onClick={() =>
                  onResolve({
                    action: "mark_legitimate",
                    duplicateGroupId: (tx as Record<string, unknown>).duplicateGroupId as string,
                  })
                }
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

          {tx.detectedType === "INTERCOMPANY" && reco && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-text-secondary">
                Empresa destino: {reco.matchReason?.split(":")[2] ?? "desconocida"}
              </p>
              <button
                onClick={() =>
                  onResolve({
                    action: "mark_intercompany",
                    intercompanyAction: "confirm",
                    bankTransactionId: tx.id,
                  })
                }
                disabled={resolving}
                className="w-full h-9 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark disabled:opacity-50"
              >
                Confirmar intercompañía
              </button>
              <button
                onClick={() =>
                  onResolve({
                    action: "mark_intercompany",
                    intercompanyAction: "eliminate",
                    bankTransactionId: tx.id,
                  })
                }
                disabled={resolving}
                className="w-full h-9 border border-subtle text-[13px] font-medium rounded-md text-text-secondary hover:bg-hover disabled:opacity-50"
              >
                No es intercompañía
              </button>
            </div>
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

          {/* CAPEX detection — scenario 19 */}
          {reco?.matchReason?.startsWith("capex_detected:") && (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">CAPEX detectado</p>
                <p className="text-[11px] text-amber-600">
                  Este movimiento parece una compra de activo fijo. Registra el activo para
                  contabilizarlo correctamente.
                </p>
              </div>
              {!showCapexForm ? (
                <button
                  onClick={() => setShowCapexForm(true)}
                  disabled={resolving}
                  className="w-full h-9 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent/90 disabled:opacity-50"
                >
                  Registrar activo fijo
                </button>
              ) : (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div>
                    <label className="text-[11px] text-text-secondary">Nombre *</label>
                    <input
                      value={capexForm.name}
                      onChange={(e) => setCapexForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full border border-border rounded px-2 py-1 text-xs mt-0.5"
                      placeholder="Maquinaria línea producción"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-text-secondary">Cuenta PGC</label>
                      <input
                        value={capexForm.assetAccountCode}
                        onChange={(e) =>
                          setCapexForm((f) => ({ ...f, assetAccountCode: e.target.value }))
                        }
                        className="w-full border border-border rounded px-2 py-1 text-xs font-mono mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-secondary">Vida útil (meses)</label>
                      <input
                        type="number"
                        value={capexForm.usefulLifeMonths}
                        onChange={(e) =>
                          setCapexForm((f) => ({ ...f, usefulLifeMonths: Number(e.target.value) }))
                        }
                        className="w-full border border-border rounded px-2 py-1 text-xs font-mono mt-0.5"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={resolving || !capexForm.name}
                      onClick={() =>
                        onResolve({
                          action: "register_fixed_asset",
                          bankTransactionId: tx.id,
                          reconciliationId: reco?.id,
                          assetData: { ...capexForm, acquisitionCost: Math.abs(tx.amount) },
                        })
                      }
                      className="flex-1 h-8 bg-accent text-white text-xs rounded hover:bg-accent/90 disabled:opacity-50"
                    >
                      {resolving ? "Registrando..." : "Confirmar"}
                    </button>
                    <button
                      onClick={() => setShowCapexForm(false)}
                      className="text-xs text-text-secondary px-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Investment detection — scenario 20 */}
          {reco?.matchReason?.startsWith("investment_detected:") && (
            <div className="space-y-2">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-700 mb-1">
                  Inversión financiera detectada
                </p>
                <p className="text-[11px] text-purple-600">
                  Registra esta inversión (participación, préstamo, o instrumento financiero).
                </p>
              </div>
              {!showInvestmentForm ? (
                <button
                  onClick={() => setShowInvestmentForm(true)}
                  disabled={resolving}
                  className="w-full h-9 bg-purple-600 text-white text-[13px] font-medium rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  Registrar inversión
                </button>
              ) : (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div>
                    <label className="text-[11px] text-text-secondary">Nombre *</label>
                    <input
                      value={investForm.name}
                      onChange={(e) => setInvestForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full border border-border rounded px-2 py-1 text-xs mt-0.5"
                      placeholder="Participación Empresa X SL"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-text-secondary">Tipo</label>
                      <select
                        value={investForm.type}
                        onChange={(e) => setInvestForm((f) => ({ ...f, type: e.target.value }))}
                        className="w-full border border-border rounded px-2 py-1 text-xs mt-0.5"
                      >
                        <option value="EQUITY_SUBSIDIARY">Filial (&gt;50%)</option>
                        <option value="EQUITY_ASSOCIATE">Asociada (20-50%)</option>
                        <option value="EQUITY_OTHER">Participación (&lt;20%)</option>
                        <option value="LOAN_GRANTED">Préstamo concedido</option>
                        <option value="FUND">Fondo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-text-secondary">Cuenta PGC</label>
                      <input
                        value={investForm.pgcAccount}
                        onChange={(e) =>
                          setInvestForm((f) => ({ ...f, pgcAccount: e.target.value }))
                        }
                        className="w-full border border-border rounded px-2 py-1 text-xs font-mono mt-0.5"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-text-secondary">CIF participada</label>
                      <input
                        value={investForm.isinCif}
                        onChange={(e) => setInvestForm((f) => ({ ...f, isinCif: e.target.value }))}
                        className="w-full border border-border rounded px-2 py-1 text-xs font-mono mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-text-secondary">% participación</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={investForm.ownershipPct}
                        onChange={(e) =>
                          setInvestForm((f) => ({ ...f, ownershipPct: Number(e.target.value) }))
                        }
                        className="w-full border border-border rounded px-2 py-1 text-xs font-mono mt-0.5"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={resolving || !investForm.name}
                      onClick={() =>
                        onResolve({
                          action: "register_investment",
                          bankTransactionId: tx.id,
                          reconciliationId: reco?.id,
                          investmentData: { ...investForm, acquisitionCost: Math.abs(tx.amount) },
                        })
                      }
                      className="flex-1 h-8 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      {resolving ? "Registrando..." : "Confirmar"}
                    </button>
                    <button
                      onClick={() => setShowInvestmentForm(false)}
                      className="text-xs text-text-secondary px-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supporting document suggestion for equity/financing operations */}
          {(tx.detectedType === "FINANCIAL_OPERATION" ||
            reco?.matchReason?.includes("equity") ||
            reco?.matchReason?.includes("supporting_doc")) && (
            <Link
              href="/documentos-soporte"
              className="flex items-center gap-2 w-full h-9 px-3 border border-blue-200 bg-blue-50 text-blue-700 text-[13px] font-medium rounded-md hover:bg-blue-100"
            >
              <FileCheck size={14} />
              Registrar documento soporte
            </Link>
          )}

          {/* Register as advance — no match + positive amount */}
          {!hasMatch && tx.amount > 0 && tx.status === "PENDING" && (
            <button
              onClick={() => onResolve({ action: "register_advance", bankTransactionId: tx.id })}
              disabled={resolving}
              className="w-full h-9 border border-accent text-accent text-[13px] font-medium rounded-md hover:bg-accent-light disabled:opacity-50"
            >
              Registrar como anticipo
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
                onResolve({
                  action: "classify",
                  bankTransactionId: tx.id,
                  accountCode,
                  cashflowType,
                  createRule,
                });
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
          {showManualMatch && !pendingMatch && (
            <InvoicePicker
              isIncome={tx.amount > 0}
              onSelect={(invoiceId, invoiceAmount, invoiceNumber) => {
                const diff = Math.abs(tx.amount) - (invoiceAmount ?? 0);
                if (Math.abs(diff) > 5 && invoiceAmount) {
                  setPendingMatch({
                    invoiceId,
                    invoiceAmount,
                    invoiceNumber: invoiceNumber ?? invoiceId,
                    difference: diff,
                  });
                } else {
                  onResolve({ action: "manual_match", bankTransactionId: tx.id, invoiceId });
                }
              }}
              onCancel={() => setShowManualMatch(false)}
              resolving={resolving}
            />
          )}

          {/* Difference type selector — shown when match has significant difference */}
          {pendingMatch && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-1">Diferencia detectada</p>
                <div className="flex justify-between text-[11px] text-amber-600">
                  <span>
                    Factura {pendingMatch.invoiceNumber}: {formatAmount(pendingMatch.invoiceAmount)}
                  </span>
                  <span>Cobrado: {formatAmount(Math.abs(tx.amount))}</span>
                </div>
                <p className="text-xs font-mono font-semibold text-amber-800 mt-1">
                  Diferencia: {formatAmount(pendingMatch.difference)}
                </p>
              </div>

              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">
                  ¿A qué se debe?
                </label>
                <select
                  value={selectedDiffType}
                  onChange={(e) => setSelectedDiffType(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5 text-xs"
                >
                  <option value="">Selecciona el tipo de diferencia...</option>
                  <option value="EARLY_PAYMENT_DISCOUNT">Descuento pronto pago (706)</option>
                  <option value="BANK_COMMISSION">Comisión bancaria/pasarela (626)</option>
                  <option value="WITHHOLDING_TAX">Retención IRPF (473)</option>
                  <option value="PARTIAL_WRITE_OFF">Pérdida parcial aceptada (650)</option>
                  <option value="FX_DIFFERENCE">Diferencia de cambio (668/768)</option>
                  <option value="OVERPAYMENT_ADVANCE">Pago en exceso / anticipo (438)</option>
                  <option value="PENDING_CREDIT_NOTE">Nota de crédito pendiente</option>
                  <option value="NEGOTIATED_ADJUSTMENT">Ajuste comercial negociado</option>
                  <option value="REQUEST_CLARIFICATION">Pedir aclaración al contacto</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!selectedDiffType || resolving}
                  onClick={() => {
                    onResolve({
                      action: "manual_match",
                      bankTransactionId: tx.id,
                      invoiceId: pendingMatch.invoiceId,
                      differenceType: selectedDiffType,
                    });
                    setPendingMatch(null);
                    setSelectedDiffType("");
                  }}
                  className="flex-1 h-8 bg-accent text-white text-xs rounded hover:bg-accent/90 disabled:opacity-50"
                >
                  {resolving
                    ? "Procesando..."
                    : selectedDiffType === "REQUEST_CLARIFICATION"
                      ? "Enviar aclaración"
                      : "Confirmar match"}
                </button>
                <button
                  onClick={() => {
                    setPendingMatch(null);
                    setSelectedDiffType("");
                  }}
                  className="text-xs text-text-secondary px-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Ignore */}
          <button
            onClick={() =>
              onResolve({
                action: "ignore",
                bankTransactionId: tx.id,
                reason: "Ignorado por el controller",
              })
            }
            disabled={resolving}
            className="w-full h-8 text-[12px] text-text-tertiary hover:text-text-secondary"
          >
            Ignorar movimiento
          </button>
        </div>

        {/* Block 4 — Create rule checkbox */}
        {(hasMatch || showClassify) && (
          <label className="flex items-center gap-2 p-3 border border-subtle rounded-md cursor-pointer">
            <input
              type="checkbox"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
              className="rounded border-subtle"
            />
            <span className="text-[12px] text-text-secondary">
              Recordar esta decisión para el futuro
            </span>
          </label>
        )}
      </div>

      {/* Invoice PDF Modal */}
      {viewingPdf && (
        <InvoicePdfModal
          invoiceId={viewingPdf.id}
          invoiceNumber={viewingPdf.number}
          onClose={() => setViewingPdf(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function Row({
  label,
  value,
  valueClass = "text-text-primary",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-medium ${valueClass} text-right max-w-[200px] truncate`}>{value}</span>
    </div>
  );
}

function AccountPicker({
  onSelect,
  onCancel,
  resolving,
}: {
  bankTransactionId?: string;
  onSelect: (accountCode: string, cashflowType: string) => void;
  onCancel: () => void;
  resolving: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accounts, setAccounts] = useState<
    { code: string; name: string; cashflowType: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ accounts: typeof accounts }>(
        `/api/settings/accounts${qs({ search: debouncedSearch })}`
      )
      .then((res) => setAccounts(res.accounts))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

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
      <button
        onClick={onCancel}
        className="text-[11px] text-text-tertiary hover:text-text-secondary self-start"
      >
        Cancelar
      </button>
    </div>
  );
}

function InvoicePicker({
  isIncome,
  onSelect,
  onCancel,
  resolving,
}: {
  isIncome: boolean;
  onSelect: (invoiceId: string, invoiceAmount?: number, invoiceNumber?: string) => void;
  onCancel: () => void;
  resolving: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [invoices, setInvoices] = useState<
    { id: string; number: string; totalAmount: number; contact?: { name: string } | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const type = isIncome ? "ISSUED" : "RECEIVED";
    const params: Record<string, unknown> = { type, status: "PENDING", pageSize: 50 };
    if (debouncedSearch.trim()) params.search = debouncedSearch;
    api
      .get<{ data: typeof invoices }>(`/api/invoices${qs(params)}`)
      .then((res) => setInvoices(res.data))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [isIncome, debouncedSearch]);

  return (
    <div className="border border-subtle rounded-md p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Search size={12} className="text-text-tertiary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar factura..."
          className="flex-1 h-7 text-[12px] border-none outline-none placeholder:text-text-tertiary"
        />
      </div>
      <span className="text-[11px] font-medium text-text-secondary">
        Facturas {isIncome ? "emitidas" : "recibidas"} pendientes:
      </span>
      <div className="max-h-40 overflow-auto">
        {loading ? (
          <p className="text-[11px] text-text-tertiary p-2">Cargando...</p>
        ) : invoices.length === 0 ? (
          <p className="text-[11px] text-text-tertiary p-2">Sin facturas pendientes</p>
        ) : (
          invoices.map((inv) => (
            <button
              key={inv.id}
              onClick={() => onSelect(inv.id, inv.totalAmount, inv.number)}
              disabled={resolving}
              className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-hover rounded flex justify-between disabled:opacity-50"
            >
              <span>
                <span className="font-medium text-accent">{inv.number}</span>
                {inv.contact?.name && (
                  <span className="text-text-secondary ml-1">— {inv.contact.name}</span>
                )}
              </span>
              <span className="font-mono text-text-primary">{formatAmount(inv.totalAmount)}</span>
            </button>
          ))
        )}
      </div>
      <button
        onClick={onCancel}
        className="text-[11px] text-text-tertiary hover:text-text-secondary self-start"
      >
        Cancelar
      </button>
    </div>
  );
}
