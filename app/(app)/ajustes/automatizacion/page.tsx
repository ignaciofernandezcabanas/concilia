"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import Badge from "@/components/Badge";
import { Bot, TrendingUp, AlertTriangle, Zap, DollarSign, type LucideIcon } from "lucide-react";

interface AutomationStats {
  config: { autoExecuteThreshold: number; organizationId: string };
  stats30d: {
    txsProcessed: number;
    txsAutoExecuted: number;
    txsToBandeja: number;
    llmCallsTotal: number;
    llmCostEstimate: number;
    errorsCount: number;
    automationRate: number;
    runsCount: number;
  };
}

interface AgentRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  companiesProcessed: number;
  txsProcessed: number;
  txsAutoExecuted: number;
  txsToBandeja: number;
  llmCallsTotal: number;
  llmCostEstimate: number;
  errorsCount: number;
}

export default function AutomationPage() {
  const { data: stats, loading: statsLoading, refetch: refetchStats } = useFetch<AutomationStats>("/api/settings/automation");
  const { data: runsData, loading: runsLoading } = useFetch<{ data: AgentRun[] }>("/api/agent-runs");
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(null);

  const currentThreshold = threshold ?? stats?.config.autoExecuteThreshold ?? 0.95;
  const runs = runsData?.data ?? [];

  const handleSave = useCallback(async () => {
    if (threshold === null) return;
    setSaving(true);
    try {
      await api.put("/api/settings/automation", { autoExecuteThreshold: threshold });
      refetchStats();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [threshold, refetchStats]);

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const s = stats?.stats30d;

  return (
    <div className="p-6 max-w-5xl">
      <TopBar title="Automatización" />

      {/* Threshold slider */}
      <div className="bg-white rounded-lg border border-subtle p-5 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <Bot size={20} className="text-accent" />
          <h2 className="text-[15px] font-semibold text-text-primary">Umbral de auto-ejecución</h2>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={80}
            max={99}
            value={Math.round(currentThreshold * 100)}
            onChange={(e) => setThreshold(parseInt(e.target.value) / 100)}
            className="flex-1 accent-accent"
          />
          <span className="text-[18px] font-bold text-accent w-14 text-right">
            {Math.round(currentThreshold * 100)}%
          </span>
          {threshold !== null && threshold !== stats?.config.autoExecuteThreshold && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-3 text-[12px] font-medium bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary mt-2">
          Solo se auto-ejecutan acciones con confianza ≥ {Math.round(currentThreshold * 100)}%. El resto va a bandeja para revisión.
        </p>
      </div>

      {/* Stats 30 days */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard icon={Zap} label="Tasa automatización" value={`${s.automationRate}%`} color="text-green" />
          <StatCard icon={TrendingUp} label="Txs procesadas" value={String(s.txsProcessed)} color="text-accent" />
          <StatCard icon={AlertTriangle} label="Errores" value={String(s.errorsCount)} color={s.errorsCount > 0 ? "text-red" : "text-green"} />
          <StatCard icon={DollarSign} label="Coste LLM" value={`$${s.llmCostEstimate.toFixed(2)}`} color="text-text-secondary" />
        </div>
      )}

      {s && (
        <div className="bg-white rounded-lg border border-subtle p-5 mb-5">
          <h3 className="text-[13px] font-semibold text-text-primary mb-3">Últimos 30 días</h3>
          <div className="grid grid-cols-3 gap-4 text-[12px]">
            <div>
              <span className="text-text-tertiary">Auto-ejecutadas</span>
              <p className="text-[16px] font-bold text-green">{s.txsAutoExecuted}</p>
            </div>
            <div>
              <span className="text-text-tertiary">En bandeja</span>
              <p className="text-[16px] font-bold text-amber">{s.txsToBandeja}</p>
            </div>
            <div>
              <span className="text-text-tertiary">Llamadas LLM</span>
              <p className="text-[16px] font-bold text-text-primary">{s.llmCallsTotal}</p>
            </div>
          </div>
        </div>
      )}

      {/* Agent runs history */}
      <div className="bg-white rounded-lg border border-subtle overflow-hidden">
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-[13px] font-semibold text-text-primary">Historial de ejecuciones</h3>
        </div>
        {runsLoading ? (
          <div className="p-8 flex justify-center"><LoadingSpinner /></div>
        ) : runs.length === 0 ? (
          <p className="p-5 text-[12px] text-text-tertiary text-center">Sin ejecuciones registradas.</p>
        ) : (
          <div className="divide-y divide-border-light">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center px-5 py-3 text-[12px] hover:bg-page transition-colors">
                <span className="w-32 text-text-secondary">
                  {new Date(run.startedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="w-24"><Badge value={run.status} /></span>
                <span className="w-20 text-text-primary">{run.txsProcessed} txs</span>
                <span className="w-20 text-green">{run.txsAutoExecuted} auto</span>
                <span className="w-20 text-amber">{run.txsToBandeja} bandeja</span>
                <span className="w-16 text-text-tertiary">{run.llmCallsTotal} LLM</span>
                <span className="flex-1 text-right text-text-tertiary">${run.llmCostEstimate.toFixed(3)}</span>
                {run.errorsCount > 0 && (
                  <span className="ml-2 text-red">{run.errorsCount} err</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-subtle p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className="text-[11px] text-text-tertiary">{label}</span>
      </div>
      <p className={`text-[18px] font-bold ${color}`}>{value}</p>
    </div>
  );
}
