"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatAmount, formatMonth, getMonthRange } from "@/lib/format";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { DashboardResponse } from "@/lib/types/api";

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date());
  const { from, to } = useMemo(() => getMonthRange(date), [date]);

  const { data, loading } = useFetch<DashboardResponse>(
    `/api/reports/dashboard${qs({ from, to })}`
  );

  function shiftMonth(delta: number) {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  const d = data ?? { income: 0, expenses: 0, cashflow: 0, pendingCount: 0, reconciled: { count: 0, amount: 0 }, pendingMatch: { count: 0, amount: 0 }, unclassified: { count: 0, amount: 0 } };

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Resumen" />
      <div className="flex flex-col gap-6 p-6 px-8 flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Resumen</h1>
          <div className="flex items-center gap-2 bg-white border border-subtle rounded-md px-3 h-8">
            <button onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={16} className="text-text-secondary" />
            </button>
            <span className="text-[13px] font-medium text-text-primary capitalize w-24 text-center">
              {formatMonth(date)}
            </span>
            <button onClick={() => shiftMonth(1)}>
              <ChevronRight size={16} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-4 gap-4">
              <KPICard
                label="Ingresos"
                value={formatAmount(d.income)}
                icon={<TrendingUp size={14} className="text-green" />}
              />
              <KPICard
                label="Gastos"
                value={formatAmount(d.expenses)}
                icon={<TrendingDown size={14} className="text-red" />}
              />
              <KPICard
                label="Cashflow neto"
                value={formatAmount(d.cashflow)}
                icon={<TrendingUp size={14} className={d.cashflow >= 0 ? "text-green" : "text-red"} />}
                valueClass={d.cashflow >= 0 ? "text-green-text" : "text-red-text"}
              />
              <KPICard
                label="Pendientes"
                value={String(d.pendingCount)}
                icon={<AlertCircle size={14} className="text-amber" />}
                valueClass="text-amber"
                subtitle="requieren revisión"
              />
            </div>

            {/* Summary Table */}
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-11 px-5 border-b border-subtle">
                <span className="flex-1 text-xs font-semibold text-text-secondary">Concepto</span>
                <span className="w-[140px] text-xs font-semibold text-text-secondary text-right pr-6">Importe</span>
                <span className="w-[100px] text-xs font-semibold text-text-secondary">Estado</span>
                <span className="w-[100px] text-xs font-semibold text-text-secondary text-right">Acción</span>
              </div>
              <SummaryRow
                concept="Transacciones conciliadas"
                amount={d.reconciled.amount}
                amountColor="text-text-primary"
                statusColor="bg-green"
                statusLabel="Verde"
                statusTextColor="text-green-text"
              />
              <SummaryRow
                concept="Pendientes de match"
                amount={d.pendingMatch.amount}
                amountColor="text-amber-text"
                statusColor="bg-amber"
                statusLabel="Ámbar"
                statusTextColor="text-amber-text"
                actionLabel="Revisar →"
                actionHref="/conciliacion"
                border
              />
              <SummaryRow
                concept="Sin clasificar"
                amount={d.unclassified.amount}
                amountColor="text-red-text"
                statusColor="bg-red"
                statusLabel="Rojo"
                statusTextColor="text-red-text"
                actionLabel="Clasificar →"
                actionHref="/movimientos"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KPICard({
  label, value, icon, valueClass = "text-text-primary", subtitle,
}: {
  label: string; value: string; icon: React.ReactNode; valueClass?: string; subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-subtle p-5 flex flex-col gap-2">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <span className={`text-2xl font-semibold font-mono ${valueClass}`}>{value}</span>
      <div className="flex items-center gap-1">
        {icon}
        {subtitle && <span className="text-xs text-text-secondary">{subtitle}</span>}
      </div>
    </div>
  );
}

function SummaryRow({
  concept, amount, amountColor, statusColor, statusLabel, statusTextColor,
  actionLabel, actionHref, border = true,
}: {
  concept: string; amount: number; amountColor: string; statusColor: string;
  statusLabel: string; statusTextColor: string; actionLabel?: string;
  actionHref?: string; border?: boolean;
}) {
  return (
    <div className={`flex items-center h-11 px-5 ${border ? "border-b border-subtle" : ""}`}>
      <span className="flex-1 text-[13px] text-text-primary">{concept}</span>
      <span className={`w-[140px] text-[13px] font-medium font-mono text-right pr-6 ${amountColor}`}>
        {formatAmount(amount)}
      </span>
      <div className="w-[100px] flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className={`text-xs ${statusTextColor}`}>{statusLabel}</span>
      </div>
      <span className="w-[100px] text-right">
        {actionLabel && actionHref ? (
          <Link href={actionHref} className="text-[13px] font-medium text-accent">{actionLabel}</Link>
        ) : (
          <span className="text-[13px] text-text-tertiary">—</span>
        )}
      </span>
    </div>
  );
}
