"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PeriodSelector, { usePeriodData, type PeriodType } from "@/components/PeriodSelector";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { Download, ChevronDown, ChevronRight } from "lucide-react";

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

type Mode = "direct" | "indirect";

export default function CashflowPage() {
  const [mode, setMode] = useState<Mode>("indirect");
  const [periodType, setPeriodType] = useState<PeriodType>("quarter");
  const [offset, setOffset] = useState(0);
  const period = usePeriodData(periodType, offset);

  const path = `/api/reports/cashflow${qs({ from: period.from, to: period.to, mode })}`;
  const { data, loading } = useFetch<CashflowReport>(path, [period.from, period.to, mode]);

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
                Tesorería
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
            <button className="flex items-center gap-1.5 px-3 h-8 border border-subtle rounded-md text-[13px] text-text-primary hover:bg-hover">
              <Download size={14} />
              Exportar
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : mode === "indirect" ? (
          <EFEView data={data?.mode === "indirect" ? (data as EFEReport) : null} />
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
const fmtN = (val: number) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    val
  );

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
                            <span className="w-24 text-right text-text-tertiary text-[11px]">
                              {tx.invoiceNumber ?? ""}
                            </span>
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
