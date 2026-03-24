"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PgcTable from "@/components/PgcTable";
import PeriodSelector, { usePeriodData, type PeriodType } from "@/components/PeriodSelector";
import { BALANCE_STRUCTURE } from "@/lib/pgc-structure";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { Download } from "lucide-react";

interface BalanceLine {
  code: string;
  amount: number;
}
interface BalanceReport {
  lines: BalanceLine[];
  totals: Record<string, number>;
}

export default function BalancePage() {
  const [periodType, setPeriodType] = useState<PeriodType>("quarter");
  const [offset, setOffset] = useState(0);
  const period = usePeriodData(periodType, offset);

  // Fetch balance at end of period
  const path = `/api/reports/balance${qs({ asOf: period.to })}`;
  const { data, loading } = useFetch<BalanceReport>(path, [period.to]);

  const { dataMap, columns } = useMemo(() => {
    const map = new Map<string, number>();
    const cols = [{ key: "total", label: period.label }];

    if (!data?.lines) return { dataMap: map, columns: cols };

    for (const line of data.lines) {
      map.set(`${line.code}:total`, line.amount);
    }

    return { dataMap: map, columns: cols };
  }, [data, period.label]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Balance" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Balance de situación</h1>
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
                if (!data?.lines) return;
                const csv = [
                  "Código;Importe",
                  ...data.lines.map((l) => `${l.code};${l.amount.toFixed(2)}`),
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `balance_${period.to}.csv`;
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
        ) : (
          <>
            <PgcTable
              structure={BALANCE_STRUCTURE}
              data={dataMap}
              columns={columns}
              drilldown={{ report: "balance", asOf: period.to }}
            />

            {/* Balance validation */}
            {data?.totals && (
              <div
                className={`flex items-center justify-between px-5 py-2.5 rounded-lg text-sm ${
                  Math.abs((data.totals.totalActivo ?? 0) - (data.totals.totalPasivo ?? 0)) < 0.01
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <span className="font-medium">
                  {Math.abs((data.totals.totalActivo ?? 0) - (data.totals.totalPasivo ?? 0)) < 0.01
                    ? "Balance cuadrado ✓"
                    : `Balance descuadrado: diferencia de ${((data.totals.totalActivo ?? 0) - (data.totals.totalPasivo ?? 0)).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`}
                </span>
                <span className="font-mono text-xs">
                  Activo:{" "}
                  {(data.totals.totalActivo ?? 0).toLocaleString("es-ES", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  € | Pasivo + PN:{" "}
                  {(data.totals.totalPasivo ?? 0).toLocaleString("es-ES", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  €
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
