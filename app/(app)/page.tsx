"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import Badge from "@/components/Badge";
import { useInvoices, useTransactions } from "@/hooks/useApi";
import { formatAmount, formatMonth, getMonthRange } from "@/lib/format";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function Dashboard() {
  const [date, setDate] = useState(() => new Date());
  const { from, to } = useMemo(() => getMonthRange(date), [date]);

  const { data: invoicesData, loading: invLoading } = useInvoices({
    from,
    to,
    pageSize: 100,
  });
  const { data: txData, loading: txLoading } = useTransactions({
    from,
    to,
    pageSize: 100,
  });
  const { data: pendingTx } = useTransactions({
    status: "PENDING",
    pageSize: 1,
  });

  const loading = invLoading || txLoading;

  // Compute KPIs from real data
  const invoices = invoicesData?.data ?? [];
  const transactions = txData?.data ?? [];

  const income = invoices
    .filter((i) => i.type === "ISSUED" || i.type === "CREDIT_RECEIVED")
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const expenses = invoices
    .filter((i) => i.type === "RECEIVED" || i.type === "CREDIT_ISSUED")
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const cashflow = transactions.reduce((sum, t) => sum + t.amount, 0);
  const pendingCount = pendingTx?.pagination?.total ?? 0;

  const reconciled = transactions.filter((t) => t.status === "RECONCILED");
  const pendingMatch = transactions.filter((t) => t.status === "PENDING");
  const unclassified = transactions.filter(
    (t) => t.status !== "RECONCILED" && t.status !== "CLASSIFIED" && t.status !== "PENDING"
  );

  const reconciledAmount = reconciled.reduce((s, t) => s + Math.abs(t.amount), 0);
  const pendingMatchAmount = pendingMatch.reduce((s, t) => s + Math.abs(t.amount), 0);
  const unclassifiedAmount = unclassified.reduce((s, t) => s + Math.abs(t.amount), 0);

  function shiftMonth(delta: number) {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

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
                value={formatAmount(income)}
                icon={<TrendingUp size={14} className="text-green" />}
              />
              <KPICard
                label="Gastos"
                value={formatAmount(expenses)}
                icon={<TrendingDown size={14} className="text-red" />}
                valueClass="text-text-primary"
              />
              <KPICard
                label="Cashflow neto"
                value={formatAmount(cashflow)}
                icon={<TrendingUp size={14} className={cashflow >= 0 ? "text-green" : "text-red"} />}
                valueClass={cashflow >= 0 ? "text-green-text" : "text-red-text"}
              />
              <KPICard
                label="Pendientes"
                value={String(pendingCount)}
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
                amount={reconciledAmount}
                amountColor="text-text-primary"
                statusColor="bg-green"
                statusLabel="Verde"
                statusTextColor="text-green-text"
              />
              <SummaryRow
                concept="Pendientes de match"
                amount={pendingMatchAmount}
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
                amount={unclassifiedAmount}
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
  concept,
  amount,
  amountColor,
  statusColor,
  statusLabel,
  statusTextColor,
  actionLabel,
  actionHref,
  border = true,
}: {
  concept: string;
  amount: number;
  amountColor: string;
  statusColor: string;
  statusLabel: string;
  statusTextColor: string;
  actionLabel?: string;
  actionHref?: string;
  border?: boolean;
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
          <Link href={actionHref} className="text-[13px] font-medium text-accent">
            {actionLabel}
          </Link>
        ) : (
          <span className="text-[13px] text-text-tertiary">—</span>
        )}
      </span>
    </div>
  );
}
