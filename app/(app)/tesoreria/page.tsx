"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { formatAmount } from "@/lib/format";
import { Wallet, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface ForecastItem {
  type: string;
  description: string;
  amount: number;
  dueDate: string;
  probability: number;
}

interface ForecastWeek {
  weekStart: string;
  weekEnd: string;
  expectedInflows: number;
  expectedOutflows: number;
  netFlow: number;
  projectedBalance: number;
  details: ForecastItem[];
}

interface ForecastReport {
  currentBalance: number;
  balanceDate: string;
  weeks: ForecastWeek[];
  totals: { totalExpectedInflows: number; totalExpectedOutflows: number; projectedEndBalance: number };
  horizon: number;
}

export default function TesoreriaPage() {
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const { data, loading } = useFetch<ForecastReport>("/api/reports/forecast?weeks=13");

  const weeks = data?.weeks ?? [];
  const minBalance = weeks.length > 0 ? Math.min(...weeks.map((w) => w.projectedBalance)) : 0;
  const maxBalance = weeks.length > 0 ? Math.max(...weeks.map((w) => w.projectedBalance)) : 0;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Tesorería" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        <h1 className="text-[22px] font-semibold text-text-primary">Previsión de tesorería</h1>

        {loading ? <LoadingSpinner /> : !data ? (
          <p className="text-[13px] text-text-tertiary text-center py-12">Sin datos de tesorería.</p>
        ) : (
          <>
            {/* Current balance card */}
            <div className="bg-white rounded-lg border border-subtle p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center">
                <Wallet size={20} className="text-accent" />
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Saldo actual</span>
                <span className="text-[24px] font-bold font-mono text-text-primary">{formatAmount(data.currentBalance)}</span>
                <span className="text-[11px] text-text-tertiary ml-2">al {new Date(data.balanceDate).toLocaleDateString("es-ES")}</span>
              </div>
              <div className="ml-auto text-right">
                <span className="text-[11px] text-text-tertiary block">Proyección {data.horizon} semanas</span>
                <span className={`text-[18px] font-semibold font-mono ${data.totals.projectedEndBalance >= 0 ? "text-green-text" : "text-red-text"}`}>
                  {formatAmount(data.totals.projectedEndBalance)}
                </span>
              </div>
            </div>

            {/* SVG Chart */}
            <div className="bg-white rounded-lg border border-subtle p-5">
              <span className="text-[12px] font-semibold text-text-secondary mb-3 block">Evolución del saldo</span>
              <BalanceChart weeks={weeks} minBalance={minBalance} maxBalance={maxBalance} />
            </div>

            {/* Weekly detail table */}
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                <span className="w-6" />
                <span className="w-40">Semana</span>
                <span className="w-28 text-right">Cobros</span>
                <span className="w-28 text-right">Pagos</span>
                <span className="w-28 text-right">Flujo neto</span>
                <span className="flex-1 text-right">Saldo proyectado</span>
              </div>
              {weeks.map((week, i) => {
                const expanded = expandedWeek === i;
                const isAlert = week.projectedBalance < 0;
                return (
                  <div key={i}>
                    <div
                      className={`flex items-center h-11 px-5 border-b border-border-light text-[13px] cursor-pointer hover:bg-page transition-colors ${isAlert ? "bg-red-light/30" : ""}`}
                      onClick={() => setExpandedWeek(expanded ? null : i)}
                    >
                      <span className="w-6 text-text-tertiary">
                        {week.details.length > 0 ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
                      </span>
                      <span className="w-40 text-text-secondary">
                        {formatWeekRange(week.weekStart, week.weekEnd)}
                        {isAlert && <AlertTriangle size={12} className="text-red inline ml-1.5" />}
                      </span>
                      <span className="w-28 text-right font-mono text-green-text">{week.expectedInflows > 0 ? `+${formatAmount(week.expectedInflows)}` : "—"}</span>
                      <span className="w-28 text-right font-mono text-red-text">{week.expectedOutflows > 0 ? `-${formatAmount(week.expectedOutflows)}` : "—"}</span>
                      <span className={`w-28 text-right font-mono font-medium ${week.netFlow >= 0 ? "text-green-text" : "text-red-text"}`}>
                        {formatAmount(week.netFlow)}
                      </span>
                      <span className={`flex-1 text-right font-mono font-semibold ${week.projectedBalance >= 0 ? "text-text-primary" : "text-red-text"}`}>
                        {formatAmount(week.projectedBalance)}
                      </span>
                    </div>
                    {expanded && week.details.length > 0 && (
                      <div className="bg-page border-b border-subtle">
                        {week.details.map((item, j) => (
                          <div key={j} className="flex items-center h-8 px-5 pl-12 text-[11px]">
                            <span className={`w-14 font-medium ${item.amount > 0 ? "text-green-text" : "text-red-text"}`}>
                              {item.type === "invoice_cobro" ? "Cobro" : item.type === "invoice_pago" ? "Pago" : "Recurrente"}
                            </span>
                            <span className="flex-1 text-text-secondary truncate">{item.description}</span>
                            <span className="w-20 text-right font-mono">{formatAmount(Math.abs(item.amount))}</span>
                            <span className="w-16 text-right text-text-tertiary">{Math.round(item.probability * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BalanceChart({ weeks, minBalance, maxBalance }: { weeks: ForecastWeek[]; minBalance: number; maxBalance: number }) {
  if (weeks.length === 0) return null;

  const W = 700;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 25, left: 10 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const range = maxBalance - minBalance || 1;
  const yScale = (v: number) => PAD.top + chartH - ((v - minBalance) / range) * chartH;
  const xScale = (i: number) => PAD.left + (i / (weeks.length - 1)) * chartW;

  const points = weeks.map((w, i) => `${xScale(i)},${yScale(w.projectedBalance)}`).join(" ");
  const areaPoints = `${xScale(0)},${yScale(0)} ${points} ${xScale(weeks.length - 1)},${yScale(0)}`;
  const zeroY = yScale(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {/* Zero line */}
      {minBalance < 0 && (
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="#e5e7eb" strokeDasharray="4 4" />
      )}
      {/* Area */}
      <polygon points={areaPoints} fill="rgba(59,130,246,0.08)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" />
      {/* Dots */}
      {weeks.map((w, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(w.projectedBalance)} r="3"
          fill={w.projectedBalance < 0 ? "#ef4444" : "#3b82f6"} />
      ))}
      {/* Week labels */}
      {weeks.map((w, i) => (
        i % 2 === 0 ? (
          <text key={i} x={xScale(i)} y={H - 5} textAnchor="middle" className="text-[9px] fill-text-tertiary">
            {new Date(w.weekStart).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
          </text>
        ) : null
      ))}
    </svg>
  );
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${s.toLocaleDateString("es-ES", opts)} — ${e.toLocaleDateString("es-ES", opts)}`;
}
