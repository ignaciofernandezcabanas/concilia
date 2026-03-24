"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatAmount, formatMonth, getMonthRange } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Bot,
  Clock,
  Wallet,
  ArrowRight,
  BarChart3,
  GitCompare,
  Briefcase,
} from "lucide-react";
import Link from "next/link";
import type { DashboardResponse } from "@/lib/types/api";

interface BriefingNotification {
  id: string;
  body: string;
  createdAt: string;
}

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date());
  const { from, to } = useMemo(() => getMonthRange(date), [date]);

  const { data, loading } = useFetch<DashboardResponse>(
    `/api/reports/dashboard${qs({ from, to })}`
  );

  const { data: agingData } = useFetch<{ dso?: number }>(`/api/reports/aging?type=receivable`);
  const dsoValue = agingData?.dso;
  const dsoDisplay = dsoValue != null ? `${Math.round(dsoValue)}` : "—";
  const dsoColor =
    dsoValue == null
      ? "text-text-tertiary"
      : dsoValue < 45
        ? "text-green-text"
        : dsoValue < 60
          ? "text-amber"
          : "text-red-text";

  const { data: briefingData } = useFetch<{ data: BriefingNotification[] }>(
    `/api/notifications${qs({ type: "DAILY_BRIEFING", limit: 1 })}`
  );

  const todayBriefing = useMemo(() => {
    const notif = briefingData?.data?.[0];
    if (!notif) return null;
    const notifDate = new Date(notif.createdAt);
    const today = new Date();
    if (notifDate.toDateString() === today.toDateString()) return notif;
    return null;
  }, [briefingData]);

  function shiftMonth(delta: number) {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  const d = data ?? {
    income: 0,
    expenses: 0,
    cashflow: 0,
    pendingCount: 0,
    reconciled: { count: 0, amount: 0 },
    pendingMatch: { count: 0, amount: 0 },
    unclassified: { count: 0, amount: 0 },
  };

  const ebitda = d.income - d.expenses; // Simplified — real EBITDA adds back depreciation

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Resumen" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        {/* Briefing */}
        {todayBriefing && (
          <div className="bg-accent/5 border border-accent/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <Bot size={16} className="text-accent" />
              <span className="text-[13px] font-semibold text-accent">Briefing diario</span>
            </div>
            <p className="text-[12px] text-text-primary whitespace-pre-line leading-relaxed">
              {todayBriefing.body}
            </p>
          </div>
        )}

        {/* Header + month selector */}
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
            {/* KPIs — 2 rows of 3 */}
            <div className="grid grid-cols-3 gap-4">
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
                label="EBITDA"
                value={formatAmount(ebitda)}
                icon={<BarChart3 size={14} className={ebitda >= 0 ? "text-green" : "text-red"} />}
                valueClass={ebitda >= 0 ? "text-green-text" : "text-red-text"}
                subtitle={
                  d.income > 0 ? `${Math.round((ebitda / d.income) * 100)}% margen` : undefined
                }
              />
              <KPICard
                label="Cashflow neto"
                value={formatAmount(d.cashflow)}
                icon={<Wallet size={14} className={d.cashflow >= 0 ? "text-green" : "text-red"} />}
                valueClass={d.cashflow >= 0 ? "text-green-text" : "text-red-text"}
              />
              <KPICard
                label="DSO"
                value={dsoDisplay}
                icon={<Clock size={14} className={dsoColor} />}
                subtitle="días medios cobro"
                valueClass={dsoColor}
              />
              <KPICard
                label="Bandeja"
                value={String(d.pendingCount)}
                icon={
                  <AlertCircle
                    size={14}
                    className={d.pendingCount > 0 ? "text-amber" : "text-green"}
                  />
                }
                valueClass={d.pendingCount > 0 ? "text-amber" : "text-green-text"}
                subtitle="requieren revisión"
              />
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-4 gap-4">
              <QuickAction
                label={`${d.pendingCount} items en bandeja`}
                href="/conciliacion"
                icon={<GitCompare size={16} className="text-accent" />}
                description={d.pendingCount > 0 ? "Procesar excepciones" : "Todo al día"}
              />
              <QuickAction
                label="Facturas vencidas"
                href="/cuentas-cobrar"
                icon={<Clock size={16} className="text-amber" />}
                description="Ver aging y recordatorios"
              />
              <QuickAction
                label="Previsión de tesorería"
                href="/tesoreria"
                icon={<Wallet size={16} className="text-accent" />}
                description="Próximas 13 semanas"
              />
              <QuickAction
                label="Inversiones"
                href="/inversiones"
                icon={<Briefcase size={16} className="text-purple-600" />}
                description="Cartera y participaciones"
              />
            </div>

            {/* Summary table */}
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-11 px-5 border-b border-subtle">
                <span className="flex-1 text-xs font-semibold text-text-secondary">Estado</span>
                <span className="w-20 text-xs font-semibold text-text-secondary text-right">
                  Nº
                </span>
                <span className="w-[140px] text-xs font-semibold text-text-secondary text-right pr-6">
                  Importe
                </span>
                <span className="w-[100px] text-xs font-semibold text-text-secondary text-right">
                  Acción
                </span>
              </div>
              <SummaryRow
                concept="Conciliadas"
                count={d.reconciled.count}
                amount={d.reconciled.amount}
                dot="bg-green"
              />
              <SummaryRow
                concept="Pendientes de match"
                count={d.pendingMatch.count}
                amount={d.pendingMatch.amount}
                dot="bg-amber"
                actionLabel="Revisar"
                actionHref="/conciliacion"
              />
              <SummaryRow
                concept="Sin clasificar"
                count={d.unclassified.count}
                amount={d.unclassified.amount}
                dot="bg-red"
                actionLabel="Clasificar"
                actionHref="/movimientos"
                border={false}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  valueClass = "text-text-primary",
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClass?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-subtle p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium text-text-tertiary">{label}</span>
      </div>
      <span className={`text-[20px] font-semibold font-mono ${valueClass}`}>{value}</span>
      {subtitle && <span className="text-[10px] text-text-tertiary">{subtitle}</span>}
    </div>
  );
}

function QuickAction({
  label,
  href,
  icon,
  description,
}: {
  label: string;
  href: string;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-lg border border-subtle p-4 flex items-center gap-3 hover:border-accent/40 transition-colors group"
    >
      <div className="w-9 h-9 rounded-lg bg-page flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-text-primary block truncate">{label}</span>
        <span className="text-[11px] text-text-tertiary">{description}</span>
      </div>
      <ArrowRight
        size={14}
        className="text-text-tertiary group-hover:text-accent transition-colors shrink-0"
      />
    </Link>
  );
}

function SummaryRow({
  concept,
  count,
  amount,
  dot,
  actionLabel,
  actionHref,
  border = true,
}: {
  concept: string;
  count: number;
  amount: number;
  dot: string;
  actionLabel?: string;
  actionHref?: string;
  border?: boolean;
}) {
  return (
    <div className={`flex items-center h-11 px-5 ${border ? "border-b border-border-light" : ""}`}>
      <div className="flex items-center gap-2 flex-1">
        <div className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-[13px] text-text-primary">{concept}</span>
      </div>
      <span className="w-20 text-[13px] font-mono text-text-secondary text-right">{count}</span>
      <span className="w-[140px] text-[13px] font-medium font-mono text-text-primary text-right pr-6">
        {formatAmount(amount)}
      </span>
      <span className="w-[100px] text-right">
        {actionLabel && actionHref ? (
          <Link href={actionHref} className="text-[12px] font-medium text-accent hover:underline">
            {actionLabel} →
          </Link>
        ) : (
          <span className="text-[12px] text-text-tertiary">—</span>
        )}
      </span>
    </div>
  );
}
