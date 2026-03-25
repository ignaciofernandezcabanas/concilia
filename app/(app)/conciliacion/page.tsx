"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { useTransactions, useReconciliationReport } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { formatAmount, formatDate, getYearMonth } from "@/lib/format";
import { Download, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import ReconciliationPanel from "@/components/ReconciliationPanel";
import Toast from "@/components/Toast";
import BankConnectionBanner from "@/components/BankConnectionBanner";

export default function Conciliacion() {
  // ── Bandeja de conciliación ──
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<string | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const { data, loading, refetch } = useTransactions({
    status: status || undefined,
    page,
    pageSize: 25,
    sortBy: "priority",
    sortOrder: "asc",
  });

  const transactions = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;

  // ── Informe de reconciliación ──
  const [reconDate, setReconDate] = useState(() => new Date());
  const reconMonth = useMemo(() => getYearMonth(reconDate), [reconDate]);
  const { data: reconData, loading: reconLoading } = useReconciliationReport(reconMonth);

  const reconMonthLabel = reconDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  async function handleResolve(payload: Record<string, unknown>) {
    const action = payload.action as string;
    const recoId = payload.reconciliationId as string | undefined;
    const txId = payload.bankTransactionId as string | undefined;

    // Route to the correct endpoint
    const recoActions = ["approve", "reject", "investigate", "mark_return", "split_financial"];
    let url: string;
    if (recoActions.includes(action) && recoId) {
      url = `/api/reconciliation/${recoId}/resolve`;
    } else if (txId) {
      url = `/api/transactions/${txId}/action`;
    } else {
      console.error("No reconciliationId nor bankTransactionId for action", action);
      return;
    }

    setResolving(recoId || txId || "");
    try {
      await api.post(url, payload);
      refetch();
      setSelectedTxId(null);
      const labels: Record<string, string> = {
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
      setToast({
        message: labels[payload.action as string] ?? "Acción completada",
        type: "success",
      });
    } catch (err) {
      console.error("Error resolving:", err);
      setToast({
        message: err instanceof Error ? err.message : "Error al resolver",
        type: "error",
      });
    } finally {
      setResolving(null);
    }
  }

  const statuses = [
    { value: "", label: "Todos" },
    { value: "PENDING", label: "Pendiente" },
    { value: "RECONCILED", label: "Conciliado" },
    { value: "CLASSIFIED", label: "Clasificado" },
    { value: "INVESTIGATING", label: "Investigar" },
    { value: "DUPLICATE", label: "Duplicado" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Conciliación" />
      <div className="flex flex-col gap-8 p-6 px-8 flex-1">
        <BankConnectionBanner />
        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECCIÓN 1: Bandeja de conciliación                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[22px] font-semibold text-text-primary">Conciliación</h1>
            <button
              onClick={() => {
                if (transactions.length === 0) return;
                const headers = [
                  "Fecha",
                  "Concepto",
                  "Importe",
                  "Contrapartida",
                  "IBAN",
                  "Estado",
                  "Tipo",
                ];
                const rows = transactions.map((tx) => [
                  tx.valueDate
                    ? new Date(tx.valueDate as string | Date).toISOString().slice(0, 10)
                    : "",
                  (tx.conceptParsed || tx.concept || "").replace(/;/g, ","),
                  String(tx.amount),
                  tx.counterpartName ?? "",
                  tx.counterpartIban ?? "",
                  tx.status,
                  tx.detectedType ?? "",
                ]);
                const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `conciliacion_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark transition-colors"
            >
              <Download size={16} />
              Exportar
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-3">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-md border transition-colors ${
                  status === s.value
                    ? "bg-accent text-white border-accent"
                    : "bg-white text-text-secondary border-subtle hover:bg-hover"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-text-tertiary mb-3">{total} transacciones</p>

          {loading ? (
            <LoadingSpinner />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="Sin transacciones"
              description="No hay transacciones que coincidan con los filtros."
            />
          ) : (
            <>
              <div className="flex gap-0">
                {/* Table */}
                <div
                  className={`bg-white rounded-lg border border-subtle overflow-hidden ${selectedTxId ? "flex-1 min-w-0" : "w-full"}`}
                >
                  <div className="flex items-center h-10 px-4 border-b border-subtle text-xs font-semibold text-text-secondary">
                    <span className="w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === transactions.length && transactions.length > 0}
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelected(
                              new Set(
                                transactions.filter((t) => t.status === "PENDING").map((t) => t.id)
                              )
                            );
                          else setSelected(new Set());
                        }}
                        className="rounded border-border"
                      />
                    </span>
                    <span className="w-12">Prior.</span>
                    <span className="w-28">Tipo</span>
                    <span className="w-20">Fecha</span>
                    <span className="flex-1">Concepto</span>
                    <span className="w-10 text-center font-mono">Conf.</span>
                    <span className="w-[120px] text-right">Importe</span>
                    <span className="w-20">Estado</span>
                    <span className="w-20 text-right">Acciones</span>
                  </div>
                  {transactions.map((tx) => {
                    const conf = tx.reconciliation?.confidenceScore;
                    const confPct = conf != null ? Math.round(conf * 100) : null;
                    const priority = tx.priority ?? "ROUTINE";
                    const priorityColors: Record<string, string> = {
                      URGENT: "bg-red-100 text-red-700",
                      DECISION: "bg-amber-100 text-amber-700",
                      CONFIRMATION: "bg-blue-100 text-blue-700",
                      ROUTINE: "bg-gray-100 text-gray-500",
                    };
                    const econ = (tx as Record<string, unknown>).economicCategory as
                      | string
                      | undefined;
                    const isCapex = econ?.startsWith("CAPEX");
                    const isInvestment = econ?.startsWith("INVESTMENT") || econ === "LOAN_GRANTED";

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTxId(tx.id === selectedTxId ? null : tx.id)}
                        className={`flex items-center h-12 px-4 text-[13px] border-b border-border-light row-hover hover:bg-page cursor-pointer ${tx.id === selectedTxId ? "bg-accent-light/30" : ""} ${priority === "URGENT" ? "border-l-2 border-l-red" : ""}`}
                      >
                        <span className="w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(tx.id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(tx.id);
                              else next.delete(tx.id);
                              setSelected(next);
                            }}
                            className="rounded border-border"
                          />
                        </span>
                        <span className="w-12">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${priorityColors[priority] ?? priorityColors.ROUTINE}`}
                          >
                            {priority === "URGENT"
                              ? "URG"
                              : priority === "DECISION"
                                ? "DEC"
                                : priority === "CONFIRMATION"
                                  ? "CONF"
                                  : "—"}
                          </span>
                        </span>
                        <span className="w-28">
                          {isCapex ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                              CAPEX
                            </span>
                          ) : isInvestment ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                              INVEST
                            </span>
                          ) : tx.detectedType ? (
                            <Badge value={tx.detectedType} />
                          ) : null}
                        </span>
                        <span className="w-20 text-text-secondary text-xs">
                          {formatDate(tx.valueDate)}
                        </span>
                        <span
                          className="flex-1 text-text-primary truncate"
                          title={tx.conceptParsed || tx.concept || undefined}
                        >
                          {tx.conceptParsed || tx.concept || "—"}
                        </span>
                        <span className="w-10 text-center font-mono">
                          {confPct != null && (
                            <span
                              className={`text-[10px] font-mono font-medium ${confPct >= 90 ? "text-green-600" : confPct >= 70 ? "text-amber-600" : "text-red-500"}`}
                            >
                              {confPct}%
                            </span>
                          )}
                        </span>
                        <span
                          className={`w-[120px] text-right font-mono font-medium ${tx.amount >= 0 ? "text-green-text" : "text-red-text"}`}
                        >
                          {formatAmount(tx.amount)}
                        </span>
                        <span className="w-20">
                          <Badge value={tx.status} />
                        </span>
                        <span className="w-20 flex justify-end gap-1">
                          {tx.status === "PENDING" && tx.reconciliation ? (
                            <>
                              <button
                                disabled={!!resolving}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (tx.reconciliation?.id)
                                    handleResolve({
                                      action: "approve",
                                      reconciliationId: tx.reconciliation.id,
                                    });
                                }}
                                className="p-1 rounded hover:bg-green-light text-green transition-colors"
                                title="Aprobar"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                disabled={!!resolving}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (tx.reconciliation?.id)
                                    handleResolve({
                                      action: "reject",
                                      reconciliationId: tx.reconciliation.id,
                                      reason: "Rechazado por el usuario",
                                    });
                                }}
                                className="p-1 rounded hover:bg-red-light text-red transition-colors"
                                title="Rechazar"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : tx.status === "PENDING" && !tx.reconciliation ? (
                            <span className="text-[9px] text-accent font-medium">Clasificar</span>
                          ) : tx.status === "CLASSIFIED" ? (
                            <span className="text-[9px] font-mono text-text-tertiary">
                              {(tx as Record<string, unknown>).classification ? "PGC" : "—"}
                            </span>
                          ) : (
                            <span className="text-[9px] text-text-tertiary">Ver</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Batch action bar */}
                {selected.size > 0 && (
                  <div className="sticky bottom-0 bg-white border-t border-subtle px-5 py-3 flex items-center gap-3 shadow-lg z-10">
                    <span className="text-sm font-medium text-text-primary">
                      {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
                    </span>
                    <button
                      disabled={batchProcessing}
                      onClick={async () => {
                        setBatchProcessing(true);
                        try {
                          const items = transactions.filter(
                            (t) => selected.has(t.id) && t.reconciliation?.id
                          );
                          for (const tx of items) {
                            await api.post(`/api/reconciliation/${tx.reconciliation!.id}/resolve`, {
                              action: "approve",
                            });
                          }
                          setToast({ message: `${items.length} items aprobados`, type: "success" });
                          setSelected(new Set());
                          refetch();
                        } catch {
                          setToast({ message: "Error al procesar batch", type: "error" });
                        }
                        setBatchProcessing(false);
                      }}
                      className="text-xs bg-green text-white px-3 py-1.5 rounded hover:bg-green/90 disabled:opacity-50"
                    >
                      {batchProcessing ? "Procesando..." : `Aprobar ${selected.size}`}
                    </button>
                    <button
                      disabled={batchProcessing}
                      onClick={async () => {
                        setBatchProcessing(true);
                        try {
                          for (const txId of Array.from(selected)) {
                            await api.post(`/api/transactions/${txId}/action`, {
                              action: "ignore",
                            });
                          }
                          setToast({
                            message: `${selected.size} items ignorados`,
                            type: "success",
                          });
                          setSelected(new Set());
                          refetch();
                        } catch {
                          setToast({ message: "Error", type: "error" });
                        }
                        setBatchProcessing(false);
                      }}
                      className="text-xs border border-border text-text-secondary px-3 py-1.5 rounded hover:bg-hover disabled:opacity-50"
                    >
                      Ignorar {selected.size}
                    </button>
                    <button
                      onClick={() => setSelected(new Set())}
                      className="text-xs text-text-tertiary ml-auto"
                    >
                      Deseleccionar
                    </button>
                  </div>
                )}

                {/* Panel */}
                {selectedTxId &&
                  (() => {
                    const selectedTx = transactions.find((t) => t.id === selectedTxId);
                    if (!selectedTx) return null;
                    return (
                      <ReconciliationPanel
                        tx={selectedTx}
                        onResolve={handleResolve}
                        onClose={() => setSelectedTxId(null)}
                        resolving={!!resolving}
                      />
                    );
                  })()}
              </div>
              {/* end flex container */}

              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-text-tertiary">
                  Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 h-8 text-[13px] border border-subtle rounded-md disabled:opacity-30 hover:bg-hover"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 h-8 text-[13px] border border-subtle rounded-md disabled:opacity-30 hover:bg-hover"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Separator */}
        <hr className="border-subtle" />

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECCIÓN 2: Informe de reconciliación                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Informe de reconciliación</h2>
            <div className="flex items-center gap-2 bg-white border border-subtle rounded-md px-3 h-8">
              <button
                onClick={() => setReconDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              >
                <ChevronLeft size={16} className="text-text-secondary" />
              </button>
              <span className="text-[13px] font-medium text-text-primary capitalize w-32 text-center">
                {reconMonthLabel}
              </span>
              <button
                onClick={() => setReconDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              >
                <ChevronRight size={16} className="text-text-secondary" />
              </button>
            </div>
          </div>

          {reconLoading ? (
            <LoadingSpinner />
          ) : !reconData ? (
            <p className="text-[13px] text-text-tertiary">Sin datos para este periodo.</p>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-white rounded-lg border border-subtle p-5 text-center">
                  <div className="text-xs text-text-secondary mb-2">Saldo según Holded</div>
                  <div className="text-2xl font-semibold font-mono text-accent">
                    {formatAmount(reconData.saldoHolded ?? 0)}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-subtle p-5 text-center">
                  <div className="text-xs text-text-secondary mb-2">Diferencia</div>
                  <div
                    className={`text-2xl font-semibold font-mono ${(reconData.diferencia ?? 0) === 0 ? "text-green-text" : "text-red"}`}
                  >
                    {formatAmount(reconData.diferencia ?? 0)}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-subtle p-5 text-center">
                  <div className="text-xs text-text-secondary mb-2">Saldo según banco</div>
                  <div className="text-2xl font-semibold font-mono text-green">
                    {formatAmount(reconData.saldoBanco ?? 0)}
                  </div>
                </div>
              </div>

              {/* Partidas Holded */}
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                Partidas en Holded no reflejadas en banco
              </h3>
              <div className="bg-white rounded-lg border border-subtle overflow-hidden mb-5">
                <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                  <span className="w-24">Nº Factura</span>
                  <span className="flex-1">Contacto</span>
                  <span className="w-[120px] text-right font-mono">Pendiente</span>
                  <span className="w-20 text-right">Estado</span>
                </div>
                {(reconData.unreconciledInvoices ?? []).length === 0 ? (
                  <div className="px-5 py-4 text-[13px] text-text-tertiary">
                    Sin partidas pendientes
                  </div>
                ) : (
                  (reconData.unreconciledInvoices ?? []).map((item) => (
                    <div
                      key={item.invoiceId}
                      className="flex items-center h-11 px-5 text-[13px] border-b border-border-light hover:bg-hover transition-colors"
                    >
                      <span className="w-24 text-accent font-medium">{item.number}</span>
                      <span className="flex-1 text-text-primary">{item.contactName}</span>
                      <span className="w-[120px] text-right font-mono font-medium text-text-primary">
                        {formatAmount(item.amountPending)}
                      </span>
                      <span className="w-20 text-right">
                        <Badge value={item.status} />
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Partidas banco */}
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                Partidas en banco no reflejadas en Holded
              </h3>
              <div className="bg-white rounded-lg border border-subtle overflow-hidden">
                <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                  <span className="w-24">Fecha</span>
                  <span className="flex-1">Concepto</span>
                  <span className="w-[120px] text-right font-mono">Importe</span>
                  <span className="w-24 text-right">Estado</span>
                </div>
                {(reconData.unreconciledTransactions ?? []).length === 0 ? (
                  <div className="px-5 py-4 text-[13px] text-text-tertiary">
                    Sin partidas pendientes
                  </div>
                ) : (
                  (reconData.unreconciledTransactions ?? []).map((item) => (
                    <div
                      key={item.transactionId}
                      className="flex items-center h-11 px-5 text-[13px] border-b border-border-light hover:bg-hover transition-colors"
                    >
                      <span className="w-24 text-text-secondary">
                        {new Date(item.valueDate).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="flex-1 text-text-primary truncate">{item.concept}</span>
                      <span
                        className={`w-[120px] text-right font-mono font-medium ${item.amount < 0 ? "text-red-text" : "text-green-text"}`}
                      >
                        {formatAmount(item.amount)}
                      </span>
                      <span className="w-24 text-right">
                        <Badge value={item.status} />
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
