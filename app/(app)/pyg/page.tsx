/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PgcTable from "@/components/PgcTable";
import PeriodSelector, { usePeriodData, type PeriodType } from "@/components/PeriodSelector";
import { PYG_STRUCTURE } from "@/lib/pgc-structure";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { Download } from "lucide-react";

interface PyGLine {
  code: string;
  amount: number;
  percentOverRevenue: number | null;
  pctOverRevenue?: number | null;
  budget?: number;
  budgetVar?: number;
  budgetVarPct?: number | null;
  priorYear?: number;
  priorYearVar?: number;
  priorYearVarPct?: number | null;
  priorMonth?: number;
  priorMonthVar?: number;
  priorMonthVarPct?: number | null;
  children?: PyGLine[];
}
interface PyGReport {
  lines: PyGLine[];
  results: { ebitda: number | null };
}

export default function PyGPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("quarter");
  const [offset, setOffset] = useState(0);
  const period = usePeriodData(periodType, offset);

  // Comparison toggles
  const [compareBudget, setCompareBudget] = useState(true);
  const [comparePriorYear, setComparePriorYear] = useState(true);
  const [comparePriorMonth, setComparePriorMonth] = useState(false);

  // Build query params with comparison flags
  const compareParams: Record<string, unknown> = {
    from: period.from,
    to: period.to,
    level: 4,
    includeEbitda: true,
  };
  if (compareBudget) compareParams.compareBudget = true;
  if (comparePriorYear) compareParams.comparePriorYear = true;
  if (comparePriorMonth) compareParams.comparePriorMonth = true;

  const totalPath = `/api/reports/pyg${qs(compareParams)}`;

  const { data: totalData, loading } = useFetch<PyGReport>(totalPath, [
    period.from,
    period.to,
    compareBudget,
    comparePriorYear,
    comparePriorMonth,
  ]);

  // Build data map + comparison data maps
  const { dataMap, pctMap, columns, comparisonRows } = useMemo(() => {
    const dataMap = new Map<string, number>();
    const pctMap = new Map<string, number>();
    const comparisonRows = new Map<
      string,
      {
        pctOverRevenue?: number | null;
        budget?: number;
        budgetVar?: number;
        budgetVarPct?: number | null;
        priorYear?: number;
        priorYearVar?: number;
        priorYearVarPct?: number | null;
        priorMonth?: number;
        priorMonthVar?: number;
        priorMonthVarPct?: number | null;
      }
    >();

    if (!totalData?.lines) return { dataMap, pctMap, columns: [], comparisonRows };

    const cols = [{ key: "total", label: "Total" }];

    for (const line of totalData.lines) {
      dataMap.set(`${line.code}:total`, line.amount);
      if (line.percentOverRevenue != null) {
        pctMap.set(line.code, line.percentOverRevenue);
      }
      // Store comparison data per line code
      comparisonRows.set(line.code, {
        pctOverRevenue: line.pctOverRevenue ?? line.percentOverRevenue,
        budget: line.budget,
        budgetVar: line.budgetVar,
        budgetVarPct: line.budgetVarPct,
        priorYear: line.priorYear,
        priorYearVar: line.priorYearVar,
        priorYearVarPct: line.priorYearVarPct,
        priorMonth: line.priorMonth,
        priorMonthVar: line.priorMonthVar,
        priorMonthVarPct: line.priorMonthVarPct,
      });
      // Map sub-lines from children
      if (line.children) {
        for (const child of line.children) {
          for (const tpl of PYG_STRUCTURE) {
            if (tpl.type === "sub" && tpl.accounts) {
              const parentCode = tpl.code.replace(/[a-z]$/, "");
              if (parentCode === line.code) {
                const prefixes = tpl.accounts.split(",").map((s) => s.trim().replace("*", ""));
                if (prefixes.some((p) => child.code.startsWith(p))) {
                  const existing = dataMap.get(`${tpl.code}:total`) ?? 0;
                  dataMap.set(`${tpl.code}:total`, existing + child.amount);
                }
              }
            }
          }
        }
      }
    }

    // EBITDA
    if (totalData.results.ebitda != null) {
      dataMap.set("EBITDA:total", totalData.results.ebitda);
    }

    return { dataMap, pctMap, columns: cols, comparisonRows };
  }, [totalData]);

  // Check if any comparison has data
  const hasComparisons = compareBudget || comparePriorYear || comparePriorMonth;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="PyG" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Perdidas y ganancias</h1>
          <div className="flex items-center gap-2.5">
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
                if (!totalData?.lines) return;
                const csv = [
                  "Código;Concepto;Importe",
                  ...totalData.lines.map(
                    (l: { code: string; label?: string; amount: number }) =>
                      `${l.code};${l.label ?? ""};${l.amount.toFixed(2)}`
                  ),
                ].join("\n");
                const blob = new Blob([csv], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `pyg_${period.from}_${period.to}.csv`;
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

        {/* Comparison toggles */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[12px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={compareBudget}
              onChange={(e) => setCompareBudget(e.target.checked)}
              className="rounded border-subtle"
            />
            Presupuesto
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={comparePriorYear}
              onChange={(e) => setComparePriorYear(e.target.checked)}
              className="rounded border-subtle"
            />
            Ano anterior
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={comparePriorMonth}
              onChange={(e) => setComparePriorMonth(e.target.checked)}
              className="rounded border-subtle"
            />
            Mes anterior
          </label>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : !hasComparisons ? (
          <PgcTable
            structure={PYG_STRUCTURE}
            data={dataMap}
            columns={columns}
            pctData={pctMap}
            drilldown={{ report: "pyg", from: period.from, to: period.to }}
          />
        ) : (
          <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
            {/* Header */}
            <div className="flex items-center h-10 px-5 bg-subtotal border-b border-subtle text-xs font-semibold text-text-secondary">
              <span className="flex-1">Concepto</span>
              <span className="w-28 text-right">Importe</span>
              <span className="w-20 text-right">% s/ventas</span>
              {compareBudget && (
                <>
                  <span className="w-28 text-right">Presupuesto</span>
                  <span className="w-24 text-right">Var. Ppto.</span>
                </>
              )}
              {comparePriorYear && (
                <>
                  <span className="w-28 text-right">Ano ant.</span>
                  <span className="w-24 text-right">Var. YoY</span>
                </>
              )}
              {comparePriorMonth && (
                <>
                  <span className="w-28 text-right">Mes ant.</span>
                  <span className="w-24 text-right">Var. MoM</span>
                </>
              )}
            </div>

            {/* Rows from PYG_STRUCTURE */}
            {PYG_STRUCTURE.map((tpl) => {
              const val = dataMap.get(`${tpl.code}:total`) ?? 0;
              const comp = comparisonRows.get(tpl.code);
              const isSection = tpl.type === "section";
              const isSub = tpl.type === "sub";
              const isResult = tpl.type === "result";
              const isEbitda = tpl.code === "EBITDA";
              const isBold = isSection || isResult || isEbitda || tpl.type === "total";

              // Skip sub-items with zero amounts
              if (isSub && val === 0) return null;

              return (
                <div
                  key={tpl.code}
                  className={`flex items-center h-9 px-5 border-b border-border-light ${
                    isBold ? "bg-subtotal font-semibold" : ""
                  } ${isSub ? "pl-10" : ""}`}
                >
                  <span className="flex-1 text-text-primary truncate">{tpl.label}</span>
                  <span className="w-28 text-right font-mono text-text-primary">
                    {formatNumber(val)}
                  </span>
                  <span className="w-20 text-right font-mono text-text-tertiary text-[11px]">
                    {comp?.pctOverRevenue != null ? `${comp.pctOverRevenue.toFixed(1)}%` : ""}
                  </span>
                  {compareBudget && (
                    <>
                      <span className="w-28 text-right font-mono text-text-secondary">
                        {comp?.budget != null ? formatNumber(comp.budget) : ""}
                      </span>
                      <span
                        className={`w-24 text-right font-mono text-[11px] ${
                          (comp?.budgetVar ?? 0) > 0
                            ? "text-green-text"
                            : (comp?.budgetVar ?? 0) < 0
                              ? "text-red-text"
                              : "text-text-tertiary"
                        }`}
                      >
                        {comp?.budgetVar != null
                          ? `${comp.budgetVar > 0 ? "+" : ""}${formatNumber(comp.budgetVar)}`
                          : ""}
                        {comp?.budgetVarPct != null
                          ? ` (${comp.budgetVarPct > 0 ? "+" : ""}${comp.budgetVarPct.toFixed(1)}%)`
                          : ""}
                      </span>
                    </>
                  )}
                  {comparePriorYear && (
                    <>
                      <span className="w-28 text-right font-mono text-text-secondary">
                        {comp?.priorYear != null ? formatNumber(comp.priorYear) : ""}
                      </span>
                      <span
                        className={`w-24 text-right font-mono text-[11px] ${
                          (comp?.priorYearVar ?? 0) > 0
                            ? "text-green-text"
                            : (comp?.priorYearVar ?? 0) < 0
                              ? "text-red-text"
                              : "text-text-tertiary"
                        }`}
                      >
                        {comp?.priorYearVar != null
                          ? `${comp.priorYearVar > 0 ? "+" : ""}${formatNumber(comp.priorYearVar)}`
                          : ""}
                        {comp?.priorYearVarPct != null
                          ? ` (${comp.priorYearVarPct > 0 ? "+" : ""}${comp.priorYearVarPct.toFixed(1)}%)`
                          : ""}
                      </span>
                    </>
                  )}
                  {comparePriorMonth && (
                    <>
                      <span className="w-28 text-right font-mono text-text-secondary">
                        {comp?.priorMonth != null ? formatNumber(comp.priorMonth) : ""}
                      </span>
                      <span
                        className={`w-24 text-right font-mono text-[11px] ${
                          (comp?.priorMonthVar ?? 0) > 0
                            ? "text-green-text"
                            : (comp?.priorMonthVar ?? 0) < 0
                              ? "text-red-text"
                              : "text-text-tertiary"
                        }`}
                      >
                        {comp?.priorMonthVar != null
                          ? `${comp.priorMonthVar > 0 ? "+" : ""}${formatNumber(comp.priorMonthVar)}`
                          : ""}
                        {comp?.priorMonthVarPct != null
                          ? ` (${comp.priorMonthVarPct > 0 ? "+" : ""}${comp.priorMonthVarPct.toFixed(1)}%)`
                          : ""}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
