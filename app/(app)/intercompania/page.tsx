"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { useFetch } from "@/hooks/useApi";
import { api, qs } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";
import { ArrowLeftRight, Check } from "lucide-react";

interface IntercompanyLink {
  id: string;
  amount: number;
  date: string;
  concept: string | null;
  status: string;
  companyA: { id: string; name: string; shortName: string | null } | null;
  companyB: { id: string; name: string; shortName: string | null } | null;
}

export default function IntercompaniaPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const { data, loading, refetch } = useFetch<{
    data: IntercompanyLink[];
    pagination: { total: number };
  }>(`/api/intercompany${qs({ status: statusFilter || undefined, limit: 50 })}`);

  const links = data?.data ?? [];
  const detected = links.filter((l) => l.status === "DETECTED");
  const confirmed = links.filter((l) => l.status === "CONFIRMED");

  async function handleConfirm(id: string) {
    await api.post(`/api/transactions/${id}/action`, {
      action: "mark_intercompany",
      intercompanyAction: "confirm",
      intercompanyLinkId: id,
    });
    refetch();
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Intercompañía" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Operaciones intercompañía</h1>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-3 text-[12px] border border-subtle rounded-md"
          >
            <option value="">Todos</option>
            <option value="DETECTED">Pendientes</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="ELIMINATED">Eliminados</option>
          </select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-subtle p-4">
            <span className="text-[11px] text-text-tertiary">Pendientes</span>
            <p className="text-[20px] font-semibold text-amber">{detected.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-subtle p-4">
            <span className="text-[11px] text-text-tertiary">Confirmados</span>
            <p className="text-[20px] font-semibold text-green-text">{confirmed.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-subtle p-4">
            <span className="text-[11px] text-text-tertiary">Total</span>
            <p className="text-[20px] font-semibold text-text-primary">
              {data?.pagination.total ?? 0}
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : links.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Sin operaciones intercompañía"
            description="Las transferencias entre sociedades del grupo se detectan automáticamente."
          />
        ) : (
          <div className="bg-white rounded-lg border border-subtle overflow-hidden">
            <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
              <span className="w-24">Fecha</span>
              <span className="w-36">Sociedad A</span>
              <span className="w-8 text-center">→</span>
              <span className="w-36">Sociedad B</span>
              <span className="w-28 text-right">Importe</span>
              <span className="flex-1">Concepto</span>
              <span className="w-24">Estado</span>
              <span className="w-20" />
            </div>
            {links.map((link) => (
              <div
                key={link.id}
                className="flex items-center h-11 px-5 border-b border-border-light text-[13px] hover:bg-page transition-colors"
              >
                <span className="w-24 text-text-secondary">
                  {new Date(link.date).toLocaleDateString("es-ES")}
                </span>
                <span className="w-36 text-text-primary font-medium truncate">
                  {link.companyA?.shortName ?? link.companyA?.name ?? "—"}
                </span>
                <span className="w-8 text-center text-text-tertiary">→</span>
                <span className="w-36 text-text-primary font-medium truncate">
                  {link.companyB?.shortName ?? link.companyB?.name ?? "—"}
                </span>
                <span className="w-28 text-right font-mono font-medium">
                  {formatAmount(link.amount)}
                </span>
                <span className="flex-1 text-text-secondary truncate">{link.concept ?? "—"}</span>
                <span className="w-24">
                  <Badge value={link.status} />
                </span>
                <span className="w-20 flex justify-end gap-1">
                  {link.status === "DETECTED" && (
                    <button
                      onClick={() => handleConfirm(link.id)}
                      className="p-1 rounded hover:bg-green-light text-green"
                      title="Confirmar"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
