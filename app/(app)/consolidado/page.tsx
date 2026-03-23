"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatAmount, getMonthRange } from "@/lib/format";
import { Layers, ChevronLeft, ChevronRight } from "lucide-react";

type Tab = "pyg" | "balance";

interface CompanyReport {
  company: { id: string; name: string; shortName: string | null };
  report: Record<string, unknown>;
}

interface ConsolidatedResponse {
  type: string;
  companies: Array<{ id: string; name: string }>;
  perCompany: CompanyReport[];
  consolidated?: Record<string, number>;
}

export default function ConsolidadoPage() {
  const [tab, setTab] = useState<Tab>("pyg");
  const [date, setDate] = useState(() => new Date());
  const { from, to } = useMemo(() => getMonthRange(date), [date]);

  const { data, loading } = useFetch<ConsolidatedResponse>(
    `/api/reports/consolidated${qs({ report: tab, from, to })}`,
    [tab, from, to]
  );

  const companies = data?.companies ?? [];
  const perCompany = data?.perCompany ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Consolidado" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Reportes consolidados</h1>
          <div className="flex items-center gap-2 bg-white border border-subtle rounded-md px-3 h-8">
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
              <ChevronLeft size={16} className="text-text-secondary" />
            </button>
            <span className="text-[13px] font-medium text-text-primary capitalize w-24 text-center">
              {date.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <ChevronRight size={16} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-subtle">
          <button onClick={() => setTab("pyg")} className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${tab === "pyg" ? "border-accent text-accent" : "border-transparent text-text-secondary"}`}>
            PyG consolidada
          </button>
          <button onClick={() => setTab("balance")} className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${tab === "balance" ? "border-accent text-accent" : "border-transparent text-text-secondary"}`}>
            Balance consolidado
          </button>
        </div>

        {loading ? <LoadingSpinner /> : companies.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Layers size={40} className="text-text-tertiary mb-3" />
            <p className="text-[13px] text-text-secondary">No hay datos de consolidación.</p>
            <p className="text-[11px] text-text-tertiary mt-1">Necesitas al menos 2 sociedades en la organización.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-subtle overflow-hidden">
            {/* Header */}
            <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
              <span className="flex-1">Sociedad</span>
              <span className="w-24 text-right">Ingresos</span>
              <span className="w-24 text-right">Gastos</span>
              <span className="w-28 text-right">Resultado</span>
            </div>

            {/* Per company rows */}
            {perCompany.map((cr) => {
              const report = cr.report as Record<string, unknown> | null;
              const results = (report as { results?: Record<string, number> })?.results;
              // Try to extract income/expenses from PyG results
              const income = results?.ingresoExplotacion ?? 0;
              const expenses = results?.gastosExplotacion ?? 0;
              const result = results?.resultadoEjercicio ?? (income - expenses);

              return (
                <div key={cr.company.id} className="flex items-center h-11 px-5 border-b border-border-light text-[13px]">
                  <span className="flex-1 font-medium text-text-primary">{cr.company.shortName ?? cr.company.name}</span>
                  <span className="w-24 text-right font-mono">{formatAmount(Number(income))}</span>
                  <span className="w-24 text-right font-mono">{formatAmount(Number(expenses))}</span>
                  <span className={`w-28 text-right font-mono font-semibold ${Number(result) >= 0 ? "text-green-text" : "text-red-text"}`}>
                    {formatAmount(Number(result))}
                  </span>
                </div>
              );
            })}

            {/* Consolidated total */}
            {perCompany.length > 1 && (
              <div className="flex items-center h-11 px-5 bg-page text-[13px] font-semibold">
                <span className="flex-1 text-text-primary">Consolidado</span>
                <span className="w-24 text-right font-mono">
                  {formatAmount(perCompany.reduce((s, cr) => {
                    const r = (cr.report as { results?: Record<string, number> })?.results;
                    return s + Number(r?.ingresoExplotacion ?? 0);
                  }, 0))}
                </span>
                <span className="w-24 text-right font-mono">
                  {formatAmount(perCompany.reduce((s, cr) => {
                    const r = (cr.report as { results?: Record<string, number> })?.results;
                    return s + Number(r?.gastosExplotacion ?? 0);
                  }, 0))}
                </span>
                <span className="w-28 text-right font-mono text-accent">
                  {formatAmount(perCompany.reduce((s, cr) => {
                    const r = (cr.report as { results?: Record<string, number> })?.results;
                    return s + Number(r?.resultadoEjercicio ?? 0);
                  }, 0))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
