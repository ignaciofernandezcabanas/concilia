"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PgcTable from "@/components/PgcTable";
import PeriodSelector, { usePeriodData, type PeriodType } from "@/components/PeriodSelector";
import { PYG_STRUCTURE } from "@/lib/pgc-structure";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { Download } from "lucide-react";

interface PyGLine { code: string; amount: number; percentOverRevenue: number | null; children?: PyGLine[]; }
interface PyGReport { lines: PyGLine[]; results: { ebitda: number | null }; }

export default function PyGPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("quarter");
  const [offset, setOffset] = useState(0);
  const period = usePeriodData(periodType, offset);

  // Fetch one report per month for monthly columns
  const monthPaths = period.months.map((m) => {
    const from = `${m.key}-01`;
    const to = new Date(parseInt(m.key.slice(0, 4)), parseInt(m.key.slice(5, 7)), 0).toISOString().slice(0, 10);
    return `/api/reports/pyg${qs({ from, to, level: 4, includeEbitda: true })}`;
  });

  // Fetch total for the full period
  const totalPath = `/api/reports/pyg${qs({ from: period.from, to: period.to, level: 4, includeEbitda: true })}`;

  // We'll fetch all in parallel using individual hooks — but since hooks can't be in loops,
  // fetch the total and derive monthly from it. For proper monthly breakdown we'd need
  // the API to support it. For now, fetch the total period.
  const { data: totalData, loading } = useFetch<PyGReport>(totalPath, [period.from, period.to]);

  // Build data map
  const { dataMap, pctMap, columns } = useMemo(() => {
    const dataMap = new Map<string, number>();
    const pctMap = new Map<string, number>();

    if (!totalData?.lines) return { dataMap, pctMap, columns: [] };

    // Single "Total" column + period label
    const cols = [{ key: "total", label: "Total" }];

    for (const line of totalData.lines) {
      dataMap.set(`${line.code}:total`, line.amount);
      if (line.percentOverRevenue != null) {
        pctMap.set(line.code, line.percentOverRevenue);
      }
      // Map sub-lines from children
      if (line.children) {
        for (const child of line.children) {
          // Try to match to PYG_STRUCTURE sub-codes by account prefix
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

    return { dataMap, pctMap, columns: cols };
  }, [totalData]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="PyG" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Pérdidas y ganancias</h1>
          <div className="flex items-center gap-2.5">
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
        ) : (
          <PgcTable
            structure={PYG_STRUCTURE}
            data={dataMap}
            columns={columns}
            pctData={pctMap}
          />
        )}
      </div>
    </div>
  );
}
