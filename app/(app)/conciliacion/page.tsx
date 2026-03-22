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

export default function Conciliacion() {
  // ── Bandeja de conciliación ──
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<string | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const { data, loading, refetch } = useTransactions({
    status: status || undefined,
    page,
    pageSize: 25,
    sortBy: "valueDate",
    sortOrder: "desc",
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
    const recoId = payload.reconciliationId as string;
    // Use reconciliationId for the URL, fallback to a dummy for non-reco actions
    const urlId = recoId || "action";
    setResolving(recoId || (payload.bankTransactionId as string) || "");
    try {
      await api.post(`/api/reconciliation/${urlId}/resolve`, payload);
      refetch();
      setSelectedTxId(null);
    } catch (err) {
      console.error("Error resolving:", err);
      alert(err instanceof Error ? err.message : "Error al resolver");
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

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SECCIÓN 1: Bandeja de conciliación                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[22px] font-semibold text-text-primary">Conciliación</h1>
            <button className="flex items-center gap-2 bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark transition-colors">
              <Download size={16} />
              Exportar
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-3">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => { setStatus(s.value); setPage(1); }}
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
            <EmptyState title="Sin transacciones" description="No hay transacciones que coincidan con los filtros." />
          ) : (
            <>
              <div className="flex gap-0">
              {/* Table */}
              <div className={`bg-white rounded-lg border border-subtle overflow-hidden ${selectedTxId ? "flex-1 min-w-0" : "w-full"}`}>
                <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                  <span className="w-20">Tipo</span>
                  <span className="w-24">Fecha</span>
                  <span className="flex-1">Concepto</span>
                  <span className="w-[130px] text-right">Importe</span>
                  <span className="w-24">Estado</span>
                  <span className="w-24 text-right">Acciones</span>
                </div>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTxId(tx.id === selectedTxId ? null : tx.id)}
                    className={`flex items-center h-12 px-5 text-[13px] border-b border-border-light hover:bg-page transition-colors cursor-pointer ${tx.id === selectedTxId ? "bg-accent-light/30" : ""}`}
                  >
                    <span className="w-20">
                      {tx.detectedType && <Badge value={tx.detectedType} />}
                    </span>
                    <span className="w-24 text-text-secondary">{formatDate(tx.valueDate)}</span>
                    <span className="flex-1 text-text-primary truncate">
                      {tx.conceptParsed || tx.concept || "—"}
                    </span>
                    <span className={`w-[130px] text-right font-mono font-medium ${tx.amount >= 0 ? "text-green-text" : "text-red-text"}`}>
                      {formatAmount(tx.amount)}
                    </span>
                    <span className="w-24"><Badge value={tx.status} /></span>
                    <span className="w-24 flex justify-end gap-1">
                      {tx.status === "PENDING" && (tx as Record<string, unknown>).reconciliation && (
                        <>
                          <button
                            disabled={resolving === ((tx as Record<string, unknown>).reconciliation as Record<string, string>)?.id}
                            onClick={() => {
                              const recoId = ((tx as Record<string, unknown>).reconciliation as Record<string, string>)?.id;
                              if (recoId) handleResolve(recoId, "approve");
                            }}
                            className="p-1 rounded hover:bg-green-light text-green transition-colors"
                            title="Aprobar"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            disabled={resolving === ((tx as Record<string, unknown>).reconciliation as Record<string, string>)?.id}
                            onClick={() => {
                              const recoId = ((tx as Record<string, unknown>).reconciliation as Record<string, string>)?.id;
                              if (recoId) handleResolve(recoId, "reject", "Rechazado por el usuario");
                            }}
                            className="p-1 rounded hover:bg-red-light text-red transition-colors"
                            title="Rechazar"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Panel */}
              {selectedTxId && (() => {
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
              </div>{/* end flex container */}

              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-text-tertiary">Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 h-8 text-[13px] border border-subtle rounded-md disabled:opacity-30 hover:bg-hover">Anterior</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 h-8 text-[13px] border border-subtle rounded-md disabled:opacity-30 hover:bg-hover">Siguiente</button>
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
              <button onClick={() => setReconDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                <ChevronLeft size={16} className="text-text-secondary" />
              </button>
              <span className="text-[13px] font-medium text-text-primary capitalize w-32 text-center">
                {reconMonthLabel}
              </span>
              <button onClick={() => setReconDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
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
                    {formatAmount(reconData.holdedBalance ?? 0)}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-subtle p-5 text-center">
                  <div className="text-xs text-text-secondary mb-2">Diferencia</div>
                  <div className={`text-2xl font-semibold font-mono ${(reconData.difference ?? 0) === 0 ? "text-green-text" : "text-red"}`}>
                    {formatAmount(reconData.difference ?? 0)}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-subtle p-5 text-center">
                  <div className="text-xs text-text-secondary mb-2">Saldo según banco</div>
                  <div className="text-2xl font-semibold font-mono text-green">
                    {formatAmount(reconData.bankBalance ?? 0)}
                  </div>
                </div>
              </div>

              {/* Partidas Holded */}
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                Partidas en Holded no reflejadas en banco
              </h3>
              <div className="bg-white rounded-lg border border-subtle overflow-hidden mb-5">
                <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                  <span className="w-20">Fecha</span>
                  <span className="flex-1">Concepto</span>
                  <span className="w-[120px] text-right">Importe</span>
                  <span className="w-28 text-right">Estado</span>
                </div>
                {(reconData.holdedItems ?? []).length === 0 ? (
                  <div className="px-5 py-4 text-[13px] text-text-tertiary">Sin partidas pendientes</div>
                ) : (
                  (reconData.holdedItems ?? []).map((item) => (
                    <div key={item.id} className="flex items-center h-11 px-5 text-[13px] border-b border-border-light">
                      <span className="w-20 text-text-secondary">
                        {new Date(item.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                      <span className="flex-1 text-text-primary">{item.concept}</span>
                      <span className={`w-[120px] text-right font-mono font-medium ${item.amount < 0 ? "text-red-text" : "text-text-primary"}`}>
                        {formatAmount(item.amount)}
                      </span>
                      <span className="w-28 text-right">
                        {item.status && <Badge value={item.status} />}
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
                  <span className="w-20">Fecha</span>
                  <span className="flex-1">Concepto</span>
                  <span className="w-[120px] text-right">Importe</span>
                  <span className="w-28 text-right">Estado</span>
                </div>
                {(reconData.bankItems ?? []).length === 0 ? (
                  <div className="px-5 py-4 text-[13px] text-text-tertiary">Sin partidas pendientes</div>
                ) : (
                  (reconData.bankItems ?? []).map((item) => (
                    <div key={item.id} className="flex items-center h-11 px-5 text-[13px] border-b border-border-light">
                      <span className="w-20 text-text-secondary">
                        {new Date(item.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                      <span className="flex-1 text-text-primary">{item.concept}</span>
                      <span className="w-[120px] text-right font-mono font-medium text-text-primary">
                        {formatAmount(item.amount)}
                      </span>
                      <span className="w-28 text-right">
                        {item.status && <Badge value={item.status} />}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
