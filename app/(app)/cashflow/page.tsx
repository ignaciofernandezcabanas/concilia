"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PgcTable from "@/components/PgcTable";
import PeriodSelector, { usePeriodData, type PeriodType } from "@/components/PeriodSelector";
import { EFE_STRUCTURE } from "@/lib/pgc-structure";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { Download } from "lucide-react";

interface EFESection { code: string; label: string; amount: number; children?: { label: string; amount: number }[]; }
interface EFEReport { mode: "indirect"; sections: EFESection[]; totals: Record<string, number>; }

// Treasury types
interface TreasuryMonth {
  month: string; saldoInicial: number; cobrosClientes: number; pagosProveedores: number;
  nominas: number; impuestos: number; otrosIngresos: number; otrosGastos: number;
  inversionesNetas: number; financiacionNeta: number; diferenciaNeta: number; saldoFinal: number;
}
interface TreasuryReport { mode: "direct"; months: TreasuryMonth[]; totals: Record<string, number>; }
type CashflowReport = TreasuryReport | EFEReport;

type Mode = "direct" | "indirect";

export default function CashflowPage() {
  const [mode, setMode] = useState<Mode>("indirect");
  const [periodType, setPeriodType] = useState<PeriodType>("quarter");
  const [offset, setOffset] = useState(0);
  const period = usePeriodData(periodType, offset);

  const path = `/api/reports/cashflow${qs({ from: period.from, to: period.to, mode })}`;
  const { data, loading } = useFetch<CashflowReport>(path, [period.from, period.to, mode]);

  // Build EFE data map
  const { efeDataMap, efeColumns } = useMemo(() => {
    const map = new Map<string, number>();
    const cols = [{ key: "total", label: "Total" }];

    if (!data || data.mode !== "indirect") return { efeDataMap: map, efeColumns: cols };

    const report = data as EFEReport;
    for (const section of report.sections) {
      map.set(`${section.code}:total`, section.amount);
    }
    // Map totals
    if (report.totals) {
      map.set("A.5:total", report.totals.flujosExplotacion ?? 0);
      map.set("B.8:total", report.totals.flujosInversion ?? 0);
      map.set("C.12:total", report.totals.flujosFinanciacion ?? 0);
      map.set("E:total", report.totals.aumentoDisminucionEfectivo ?? 0);
      map.set("F1:total", report.totals.efectivoInicio ?? 0);
      map.set("F2:total", report.totals.efectivoFinal ?? 0);
    }
    // Map children
    for (const section of report.sections) {
      if (section.children) {
        for (const child of section.children) {
          // Match by label keywords to EFE_STRUCTURE codes
          if (child.label.includes("Resultado")) map.set("A.1:total", child.amount);
          else if (child.label.includes("Amortización")) map.set("A.2a:total", child.amount);
          else if (child.label.includes("provisiones")) map.set("A.2c:total", child.amount);
          else if (child.label.includes("deudores")) map.set("A.3b:total", child.amount);
          else if (child.label.includes("acreedores")) map.set("A.3d:total", child.amount);
        }
      }
    }

    return { efeDataMap: map, efeColumns: cols };
  }, [data]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Cashflow" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Flujo de caja</h1>
          <div className="flex items-center gap-2.5">
            {/* Mode toggle */}
            <div className="flex items-center h-8 rounded-md overflow-hidden border border-subtle">
              <button
                onClick={() => setMode("indirect")}
                className={`px-3.5 h-full text-xs font-medium ${mode === "indirect" ? "bg-accent text-white" : "bg-white text-text-secondary hover:bg-hover"}`}
              >
                EFE formal
              </button>
              <button
                onClick={() => setMode("direct")}
                className={`px-3.5 h-full text-xs font-medium border-l border-subtle ${mode === "direct" ? "bg-accent text-white" : "bg-white text-text-secondary hover:bg-hover"}`}
              >
                Tesorería
              </button>
            </div>
            <PeriodSelector
              periodType={periodType}
              setPeriodType={(pt) => { setPeriodType(pt); setOffset(0); }}
              label={period.label}
              onPrev={() => setOffset((o) => o - 1)}
              onNext={() => setOffset((o) => o + 1)}
            />
            <button className="flex items-center gap-1.5 px-3 h-8 border border-subtle rounded-md text-[13px] text-text-primary hover:bg-hover">
              <Download size={14} />
              Exportar
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : mode === "indirect" ? (
          <PgcTable
            structure={EFE_STRUCTURE}
            data={efeDataMap}
            columns={efeColumns}
            drilldown={{ report: "cashflow", from: period.from, to: period.to }}
          />
        ) : (
          <TreasuryView data={data?.mode === "direct" ? data as TreasuryReport : null} />
        )}
      </div>
    </div>
  );
}

// ── Treasury (direct) view ──

const fmtVal = (val: number) => {
  if (val === 0) return { text: "0,00", cls: "text-text-tertiary" };
  const s = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(val));
  return val < 0 ? { text: `(${s})`, cls: "text-red-text" } : { text: s, cls: "text-green-text" };
};
const fmtN = (val: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

const ROWS: { key: keyof TreasuryMonth; label: string; section: "in" | "out" }[] = [
  { key: "cobrosClientes", label: "Cobros de clientes", section: "in" },
  { key: "otrosIngresos", label: "Otros cobros", section: "in" },
  { key: "pagosProveedores", label: "Pagos a proveedores", section: "out" },
  { key: "nominas", label: "Nóminas y SS", section: "out" },
  { key: "impuestos", label: "Impuestos y tasas", section: "out" },
  { key: "otrosGastos", label: "Otros gastos operativos", section: "out" },
  { key: "financiacionNeta", label: "Cuotas préstamos", section: "out" },
  { key: "inversionesNetas", label: "Inversiones (capex)", section: "out" },
];

function TreasuryView({ data }: { data: TreasuryReport | null }) {
  const months = data?.months ?? [];
  const totals = data?.totals as Record<string, number> ?? {};
  const totalIn = (m: TreasuryMonth) => m.cobrosClientes + m.otrosIngresos;
  const totalOut = (m: TreasuryMonth) => m.pagosProveedores + m.nominas + m.impuestos + m.otrosGastos + m.financiacionNeta + m.inversionesNetas;
  const mLabel = (k: string) => new Date(k + "-15").toLocaleDateString("es-ES", { month: "short" });

  return (
    <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
      <div className="flex items-center h-10 px-6 bg-subtotal border-b border-subtle">
        <span className="flex-1 text-xs font-semibold text-text-secondary">Concepto</span>
        {months.map((m) => <span key={m.month} className="w-[110px] text-right text-xs font-semibold text-text-secondary capitalize">{mLabel(m.month)}</span>)}
        <span className="w-[110px] text-right text-xs font-semibold text-text-secondary">Total</span>
      </div>

      {/* Saldo inicial */}
      <TRow label="Saldo inicial" vals={months.map((m) => m.saldoInicial)} total={totals.saldoInicial ?? 0} bold bg />

      <div className="h-1" />
      <div className="flex items-center h-8 px-6 bg-page"><span className="text-xs font-semibold text-text-secondary">ENTRADAS</span></div>
      {ROWS.filter((r) => r.section === "in").map((r) => <TDataRow key={r.key} label={r.label} months={months} field={r.key} />)}
      <TRow label="Total entradas" vals={months.map(totalIn)} total={totals.totalCobros ?? 0} bold border vc="text-green-text" />

      <div className="h-1" />
      <div className="flex items-center h-8 px-6 bg-page"><span className="text-xs font-semibold text-text-secondary">SALIDAS</span></div>
      {ROWS.filter((r) => r.section === "out").map((r) => <TDataRow key={r.key} label={r.label} months={months} field={r.key} />)}
      <TRow label="Total salidas" vals={months.map(totalOut)} total={totals.totalPagos ?? 0} bold border vc="text-red-text" />

      <div className="h-1" />
      <div className="flex items-center h-10 px-6 bg-subtotal border-t border-subtle">
        <span className="flex-1 font-semibold text-text-primary">DIFERENCIA NETA</span>
        {months.map((m) => { const v = fmtVal(m.diferenciaNeta); return <span key={m.month} className={`w-[110px] text-right font-mono font-semibold ${v.cls}`}>{v.text}</span>; })}
        {(() => { const v = fmtVal(totals.diferenciaNeta ?? 0); return <span className={`w-[110px] text-right font-mono font-semibold ${v.cls}`}>{v.text}</span>; })()}
      </div>
      <TRow label="Saldo final" vals={months.map((m) => m.saldoFinal)} total={totals.saldoFinal ?? 0} bold bg />
    </div>
  );
}

function TRow({ label, vals, total, bold, bg, border, vc }: { label: string; vals: number[]; total: number; bold?: boolean; bg?: boolean; border?: boolean; vc?: string; }) {
  return (
    <div className={`flex items-center h-9 px-6 ${bg ? "bg-subtotal" : ""} ${border ? "border-b border-subtle" : ""}`}>
      <span className={`flex-1 ${bold ? "font-semibold" : ""} text-text-primary`}>{label}</span>
      {vals.map((v, i) => <span key={i} className={`w-[110px] text-right font-mono ${bold ? "font-semibold" : ""} ${vc || "text-text-primary"}`}>{fmtN(v)}</span>)}
      <span className={`w-[110px] text-right font-mono ${bold ? "font-semibold" : ""} ${vc || "text-text-primary"}`}>{fmtN(total)}</span>
    </div>
  );
}

function TDataRow({ label, months, field }: { label: string; months: TreasuryMonth[]; field: keyof TreasuryMonth; }) {
  const vals = months.map((m) => m[field] as number);
  const total = vals.reduce((s, v) => s + v, 0);
  return (
    <div className="flex items-center h-9 px-6 border-b border-border-light" style={{ paddingLeft: 48 }}>
      <span className="flex-1 text-text-primary">{label}</span>
      {vals.map((v, i) => { const f = fmtVal(v); return <span key={i} className={`w-[110px] text-right font-mono ${f.cls}`}>{f.text}</span>; })}
      {(() => { const f = fmtVal(total); return <span className={`w-[110px] text-right font-mono ${f.cls}`}>{f.text}</span>; })()}
    </div>
  );
}
