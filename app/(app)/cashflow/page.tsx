"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PeriodSelector, { usePeriodData, type PeriodType } from "@/components/PeriodSelector";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { Download, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { formatNumber } from "@/lib/format";

interface EFETransactionDetail {
  id: string;
  date: string;
  concept: string;
  counterpartName: string | null;
  amount: number;
  invoiceNumber?: string;
}

interface EFELine {
  label: string;
  amount: number;
  transactions?: EFETransactionDetail[];
}

interface EFESection {
  code: string;
  label: string;
  amount: number;
  children?: EFELine[];
}
interface EFEReport {
  mode: "indirect";
  sections: EFESection[];
  totals: Record<string, number>;
}

// Treasury types
interface TreasuryMonth {
  month: string;
  saldoInicial: number;
  cobrosClientes: number;
  pagosProveedores: number;
  nominas: number;
  impuestos: number;
  otrosIngresos: number;
  otrosGastos: number;
  inversionesNetas: number;
  financiacionNeta: number;
  diferenciaNeta: number;
  saldoFinal: number;
}
interface TreasuryReport {
  mode: "direct";
  months: TreasuryMonth[];
  totals: Record<string, number>;
}
type CashflowReport = TreasuryReport | EFEReport;

// WC Bridge types
interface WCBridgeStep {
  code: string;
  label: string;
  amount: number;
  isSubtotal: boolean;
}
interface WCBridgeReport {
  steps: WCBridgeStep[];
  reconciliationGap: number;
  bankChangeActual: number;
}

type Mode = "direct" | "indirect" | "bridge";

export default function CashflowPage() {
  const [mode, setMode] = useState<Mode>("indirect");
  const [periodType, setPeriodType] = useState<PeriodType>("quarter");
  const [offset, setOffset] = useState(0);
  const period = usePeriodData(periodType, offset);

  const cashflowMode = mode === "bridge" ? "indirect" : mode;
  const path = `/api/reports/cashflow${qs({ from: period.from, to: period.to, mode: cashflowMode })}`;
  const { data, loading: cashflowLoading } = useFetch<CashflowReport>(path, [
    period.from,
    period.to,
    cashflowMode,
  ]);

  const bridgePath =
    mode === "bridge" ? `/api/reports/wc-bridge${qs({ from: period.from, to: period.to })}` : null;
  const { data: bridgeData, loading: bridgeLoading } = useFetch<WCBridgeReport>(bridgePath, [
    period.from,
    period.to,
    mode,
  ]);
  const loading = mode === "bridge" ? bridgeLoading : cashflowLoading;

  // EFE data is now rendered directly by EFEView (no PgcTable mapping needed)

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
                EFE directo
              </button>
              <button
                onClick={() => setMode("bridge")}
                className={`px-3.5 h-full text-xs font-medium border-l border-subtle ${mode === "bridge" ? "bg-accent text-white" : "bg-white text-text-secondary hover:bg-hover"}`}
              >
                Bridge
              </button>
            </div>
            <PeriodSelector
              periodType={periodType}
              setPeriodType={(pt) => {
                setPeriodType(pt);
                setOffset(0);
              }}
              label={period.label}
              onPrev={() => setOffset((o) => o - 1)}
              onNext={() => setOffset((o) => o + 1)}
            />
            <button
              onClick={() => {
                const rows: string[][] = [];
                if (mode === "indirect" && data?.mode === "indirect") {
                  const efe = data as EFEReport;
                  rows.push(["Sección", "Línea", "Importe"]);
                  for (const section of efe.sections) {
                    rows.push([section.label, "", String(section.amount)]);
                    if (section.children) {
                      for (const child of section.children) {
                        rows.push(["", child.label.trim(), String(child.amount)]);
                      }
                    }
                  }
                } else if (mode === "direct" && data?.mode === "direct") {
                  const treasury = data as TreasuryReport;
                  const months = treasury.months;
                  rows.push(["Concepto", ...months.map((m) => m.month), "Total"]);
                  const addRow = (label: string, vals: number[], total: number) => {
                    rows.push([label, ...vals.map(String), String(total)]);
                  };
                  addRow(
                    "Saldo inicial",
                    months.map((m) => m.saldoInicial),
                    treasury.totals.saldoInicial ?? 0
                  );
                  for (const r of ROWS) {
                    const vals = months.map((m) => m[r.key] as number);
                    addRow(
                      r.label,
                      vals,
                      vals.reduce((s, v) => s + v, 0)
                    );
                  }
                  addRow(
                    "Diferencia neta",
                    months.map((m) => m.diferenciaNeta),
                    treasury.totals.diferenciaNeta ?? 0
                  );
                  addRow(
                    "Saldo final",
                    months.map((m) => m.saldoFinal),
                    treasury.totals.saldoFinal ?? 0
                  );
                } else if (mode === "bridge" && bridgeData) {
                  rows.push(["Concepto", "Importe"]);
                  for (const step of bridgeData.steps) {
                    rows.push([step.label, String(step.amount)]);
                  }
                  rows.push(["Variación real banco", String(bridgeData.bankChangeActual)]);
                  rows.push(["Gap de reconciliación", String(bridgeData.reconciliationGap)]);
                }
                if (rows.length === 0) return;
                const csv = rows.map((r) => r.join(";")).join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `cashflow_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 h-8 border border-subtle rounded-md text-[13px] text-text-primary hover:bg-hover"
            >
              <Download size={14} />
              Exportar
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : mode === "indirect" ? (
          <EFEView data={data?.mode === "indirect" ? (data as EFEReport) : null} />
        ) : mode === "bridge" ? (
          <BridgeView data={bridgeData ?? null} />
        ) : (
          <TreasuryView data={data?.mode === "direct" ? (data as TreasuryReport) : null} />
        )}
      </div>
    </div>
  );
}

// ── Treasury (direct) view ──

const fmtVal = (val: number) => {
  if (val === 0) return { text: "0,00", cls: "text-text-tertiary" };
  const s = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(val));
  return val < 0 ? { text: `(${s})`, cls: "text-red-text" } : { text: s, cls: "text-green-text" };
};
const fmtN = formatNumber;

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
  const totals = (data?.totals as Record<string, number>) ?? {};
  const totalIn = (m: TreasuryMonth) => m.cobrosClientes + m.otrosIngresos;
  const totalOut = (m: TreasuryMonth) =>
    m.pagosProveedores +
    m.nominas +
    m.impuestos +
    m.otrosGastos +
    m.financiacionNeta +
    m.inversionesNetas;
  const mLabel = (k: string) => new Date(k + "-15").toLocaleDateString("es-ES", { month: "short" });

  return (
    <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
      <div className="flex items-center h-10 px-6 bg-subtotal border-b border-subtle">
        <span className="flex-1 text-xs font-semibold text-text-secondary">Concepto</span>
        {months.map((m) => (
          <span
            key={m.month}
            className="w-[110px] text-right text-xs font-semibold text-text-secondary capitalize"
          >
            {mLabel(m.month)}
          </span>
        ))}
        <span className="w-[110px] text-right text-xs font-semibold text-text-secondary">
          Total
        </span>
      </div>

      {/* Saldo inicial */}
      <TRow
        label="Saldo inicial"
        vals={months.map((m) => m.saldoInicial)}
        total={totals.saldoInicial ?? 0}
        bold
        bg
      />

      <div className="h-1" />
      <div className="flex items-center h-8 px-6 bg-page">
        <span className="text-xs font-semibold text-text-secondary">ENTRADAS</span>
      </div>
      {ROWS.filter((r) => r.section === "in").map((r) => (
        <TDataRow key={r.key} label={r.label} months={months} field={r.key} />
      ))}
      <TRow
        label="Total entradas"
        vals={months.map(totalIn)}
        total={totals.totalCobros ?? 0}
        bold
        border
        vc="text-green-text"
      />

      <div className="h-1" />
      <div className="flex items-center h-8 px-6 bg-page">
        <span className="text-xs font-semibold text-text-secondary">SALIDAS</span>
      </div>
      {ROWS.filter((r) => r.section === "out").map((r) => (
        <TDataRow key={r.key} label={r.label} months={months} field={r.key} />
      ))}
      <TRow
        label="Total salidas"
        vals={months.map(totalOut)}
        total={totals.totalPagos ?? 0}
        bold
        border
        vc="text-red-text"
      />

      <div className="h-1" />
      <div className="flex items-center h-10 px-6 bg-subtotal border-t border-subtle">
        <span className="flex-1 font-semibold text-text-primary">DIFERENCIA NETA</span>
        {months.map((m) => {
          const v = fmtVal(m.diferenciaNeta);
          return (
            <span key={m.month} className={`w-[110px] text-right font-mono font-semibold ${v.cls}`}>
              {v.text}
            </span>
          );
        })}
        {(() => {
          const v = fmtVal(totals.diferenciaNeta ?? 0);
          return (
            <span className={`w-[110px] text-right font-mono font-semibold ${v.cls}`}>
              {v.text}
            </span>
          );
        })()}
      </div>
      <TRow
        label="Saldo final"
        vals={months.map((m) => m.saldoFinal)}
        total={totals.saldoFinal ?? 0}
        bold
        bg
      />
    </div>
  );
}

function TRow({
  label,
  vals,
  total,
  bold,
  bg,
  border,
  vc,
}: {
  label: string;
  vals: number[];
  total: number;
  bold?: boolean;
  bg?: boolean;
  border?: boolean;
  vc?: string;
}) {
  return (
    <div
      className={`flex items-center h-9 px-6 ${bg ? "bg-subtotal" : ""} ${border ? "border-b border-subtle" : ""}`}
    >
      <span className={`flex-1 ${bold ? "font-semibold" : ""} text-text-primary`}>{label}</span>
      {vals.map((v, i) => (
        <span
          key={i}
          className={`w-[110px] text-right font-mono ${bold ? "font-semibold" : ""} ${vc || "text-text-primary"}`}
        >
          {fmtN(v)}
        </span>
      ))}
      <span
        className={`w-[110px] text-right font-mono ${bold ? "font-semibold" : ""} ${vc || "text-text-primary"}`}
      >
        {fmtN(total)}
      </span>
    </div>
  );
}

function TDataRow({
  label,
  months,
  field,
}: {
  label: string;
  months: TreasuryMonth[];
  field: keyof TreasuryMonth;
}) {
  const vals = months.map((m) => m[field] as number);
  const total = vals.reduce((s, v) => s + v, 0);
  return (
    <div
      className="flex items-center h-9 px-6 border-b border-border-light"
      style={{ paddingLeft: 48 }}
    >
      <span className="flex-1 text-text-primary">{label}</span>
      {vals.map((v, i) => {
        const f = fmtVal(v);
        return (
          <span key={i} className={`w-[110px] text-right font-mono ${f.cls}`}>
            {f.text}
          </span>
        );
      })}
      {(() => {
        const f = fmtVal(total);
        return <span className={`w-[110px] text-right font-mono ${f.cls}`}>{f.text}</span>;
      })()}
    </div>
  );
}

// ── Bridge (Working Capital) view ──

function BridgeView({ data }: { data: WCBridgeReport | null }) {
  if (!data) return null;

  const gap = data.reconciliationGap;
  const showGapWarning = Math.abs(gap) > 1;

  return (
    <div className="space-y-3">
      {showGapWarning && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-red-700">
            Gap de reconciliacion: {fmtN(gap)} — Revisar movimientos sin conciliar.
          </span>
        </div>
      )}
      <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
        {data.steps.map((step, i) => {
          const isSeparator =
            step.code === "sep1" ||
            step.code === "sep2" ||
            step.code === "sep3" ||
            step.code === "sep4";

          if (isSeparator) {
            return <div key={step.code + i} className="h-px bg-subtle mx-5 my-0" />;
          }

          const v = fmtVal(step.amount);

          return (
            <div
              key={step.code}
              className={`flex items-center h-9 px-6 ${
                step.isSubtotal
                  ? "bg-subtotal font-semibold border-b border-subtle"
                  : "border-b border-border-light"
              } ${!step.isSubtotal ? "pl-10" : ""}`}
            >
              <span className="flex-1 text-text-primary">{step.label}</span>
              <span
                className={`w-32 text-right font-mono ${step.isSubtotal ? "font-semibold" : ""} ${v.cls}`}
              >
                {fmtN(step.amount)}
              </span>
            </div>
          );
        })}

        {/* Actual bank change */}
        <div className="flex items-center h-9 px-6 bg-subtotal border-t border-subtle">
          <span className="flex-1 font-semibold text-text-primary">Variacion real banco</span>
          <span
            className={`w-32 text-right font-mono font-semibold ${fmtVal(data.bankChangeActual).cls}`}
          >
            {fmtN(data.bankChangeActual)}
          </span>
        </div>

        {/* Gap */}
        <div
          className={`flex items-center h-9 px-6 ${showGapWarning ? "bg-red-50" : "bg-subtotal"}`}
        >
          <span
            className={`flex-1 font-semibold ${showGapWarning ? "text-red-700" : "text-text-primary"}`}
          >
            Gap de reconciliacion
          </span>
          <span
            className={`w-32 text-right font-mono font-semibold ${showGapWarning ? "text-red-700" : "text-text-tertiary"}`}
          >
            {fmtN(gap)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── EFE (direct cash-basis) view with drill-down ──

function EFEView({ data }: { data: EFEReport | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!data) return null;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
      {data.sections.map((section) => {
        const hasChildren = section.children && section.children.length > 0;
        const isTotal = !hasChildren; // D, E, F are totals without children

        return (
          <div key={section.code}>
            {/* Section header */}
            <div
              className={`flex items-center h-10 px-6 ${
                isTotal ? "bg-page" : "bg-subtotal"
              } border-b border-subtle`}
            >
              <span className="flex-1 text-xs font-semibold text-text-primary">
                {section.label}
              </span>
              <span
                className={`font-mono font-semibold ${
                  section.amount >= 0 ? "text-green-text" : "text-red-text"
                }`}
              >
                {fmtN(section.amount)} €
              </span>
            </div>

            {/* Children (expandable lines) */}
            {section.children?.map((child, i) => {
              const lineKey = `${section.code}:${i}`;
              const isOpen = expanded.has(lineKey);
              const hasTxs = child.transactions && child.transactions.length > 0;
              const isSubtotal = /^\d+\./.test(child.label.trim()); // "1.", "2.", etc.
              const isSubItem = child.label.startsWith("  "); // indented = sub-item

              return (
                <div key={lineKey}>
                  {/* Line row */}
                  <div
                    className={`flex items-center h-9 px-6 border-b border-border-light ${
                      isSubtotal ? "bg-subtotal font-semibold" : ""
                    } ${isSubItem ? "pl-16" : "pl-12"} ${
                      hasTxs ? "cursor-pointer hover:bg-hover" : ""
                    } transition-colors`}
                    onClick={() => hasTxs && toggle(lineKey)}
                  >
                    <span className="flex items-center gap-1.5 flex-1 text-text-primary">
                      {hasTxs &&
                        (isOpen ? (
                          <ChevronDown size={14} className="text-text-tertiary" />
                        ) : (
                          <ChevronRight size={14} className="text-text-tertiary" />
                        ))}
                      <span>{child.label.trim()}</span>
                      {hasTxs && (
                        <span className="text-[10px] text-text-tertiary font-normal">
                          ({child.transactions!.length})
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-mono ${
                        child.amount === 0
                          ? "text-text-tertiary"
                          : child.amount > 0
                            ? "text-green-text"
                            : "text-red-text"
                      }`}
                    >
                      {fmtN(child.amount)} €
                    </span>
                  </div>

                  {/* Expanded transactions */}
                  {isOpen && child.transactions && (
                    <div className="border-l-2 border-accent ml-12 bg-page">
                      <div className="flex items-center h-7 px-4 text-[10px] text-text-tertiary uppercase tracking-wide border-b border-border-light">
                        <span className="w-20">Fecha</span>
                        <span className="flex-1">Concepto</span>
                        <span className="w-40 text-right">Contrapartida</span>
                        <span className="w-24 text-right">Factura</span>
                        <span className="w-24 text-right">Importe</span>
                      </div>
                      {child.transactions.map((tx) => {
                        const v = fmtVal(tx.amount);
                        return (
                          <div
                            key={tx.id}
                            className="flex items-center h-8 px-4 text-[12px] border-b border-border-light last:border-0 hover:bg-hover transition-colors"
                          >
                            <span className="w-20 text-text-tertiary">{tx.date.slice(5)}</span>
                            <span className="flex-1 text-text-primary truncate pr-2">
                              {tx.concept}
                            </span>
                            <span className="w-40 text-right text-text-secondary truncate">
                              {tx.counterpartName ?? "—"}
                            </span>
                            {tx.invoiceNumber ? (
                              <a
                                href={`/facturas?search=${tx.invoiceNumber}`}
                                className="w-24 text-right text-accent text-[11px] hover:underline flex items-center justify-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye size={10} />
                                {tx.invoiceNumber}
                              </a>
                            ) : (
                              <span className="w-24 text-right text-text-tertiary text-[11px]">
                                —
                              </span>
                            )}
                            <span className={`w-24 text-right font-mono ${v.cls}`}>{v.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
