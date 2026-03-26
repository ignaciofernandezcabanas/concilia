/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import PgcTable from "@/components/PgcTable";
import { PYG_STRUCTURE, BALANCE_STRUCTURE, EFE_STRUCTURE } from "@/lib/pgc-structure";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatAmount, getMonthRange, formatPeriodLabel } from "@/lib/format";
import { Layers, ChevronLeft, ChevronRight } from "lucide-react";

type Tab = "pyg" | "balance" | "efe";

interface CompanyMeta {
  id: string;
  name: string;
  method?: string;
  ownership?: number;
}

interface ConsolidatedResponse {
  type: string;
  companies: CompanyMeta[];
  perCompany: Array<{
    company: { id: string; name: string; shortName: string | null };
    report: any;
  }>;
  consolidated?: Record<string, number>;
  eliminationDetails?: Array<{
    companyA: { name: string };
    companyB: { name: string };
    eliminationAmount: number;
    type: string;
    reasoning: string;
  }>;
  nci?: number | null;
}

export default function ConsolidadoPage() {
  const [tab, setTab] = useState<Tab>("pyg");
  const [date, setDate] = useState(() => new Date());
  const { from, to } = useMemo(() => getMonthRange(date), [date]);

  const { data, loading } = useFetch<ConsolidatedResponse>(
    `/api/reports/consolidated${qs({ report: tab, from, to })}`,
    [tab, from, to]
  );

  const companies = data?.companies ?? [];
  const perCompany = data?.perCompany ?? [];

  // Build PgcTable data map with multi-column: "code:companyId" and "code:consolidated"
  const { dataMap, columns } = useMemo(() => {
    const map = new Map<string, number>();
    const cols = perCompany.map((cr) => ({
      key: cr.company.id,
      label: cr.company.shortName ?? cr.company.name,
    }));
    cols.push({ key: "consolidated", label: "Consolidado" });

    if (tab === "pyg" || tab === "balance") {
      // Per-company lines
      for (const cr of perCompany) {
        const lines = cr.report?.lines as Array<{ code: string; amount: number }> | undefined;
        if (!lines) continue;
        for (const line of lines) {
          map.set(`${line.code}:${cr.company.id}`, line.amount);
        }
        // Also map aggregated result codes from PyG
        const results = cr.report?.results as Record<string, number> | undefined;
        if (results && tab === "pyg") {
          if (results.resultadoExplotacion != null)
            map.set(`A.1:${cr.company.id}`, results.resultadoExplotacion);
          if (results.resultadoFinanciero != null)
            map.set(`A.2r:${cr.company.id}`, results.resultadoFinanciero);
          if (results.resultadoAntesImpuestos != null)
            map.set(`A.3:${cr.company.id}`, results.resultadoAntesImpuestos);
          if (results.resultadoEjercicio != null)
            map.set(`A.4:${cr.company.id}`, results.resultadoEjercicio);
          if (results.ebitda != null) map.set(`EBITDA:${cr.company.id}`, results.ebitda);
        }
        // Balance totals
        if (cr.report?.totals && tab === "balance") {
          const t = cr.report.totals as Record<string, number>;
          for (const [k, v] of Object.entries(t)) {
            // Map totals like totalActivo → TOTAL_ACTIVO
            const code = k
              .replace("totalActivo", "TOTAL_ACTIVO")
              .replace("totalPasivo", "TOTAL_PNP")
              .replace("activoNoCorriente", "ANC")
              .replace("activoCorriente", "AC")
              .replace("patrimonioNeto", "PN")
              .replace("pasivoNoCorriente", "PNC")
              .replace("pasivoCorriente", "PC");
            map.set(`${code}:${cr.company.id}`, v);
          }
        }
      }
      // Consolidated totals
      const cons = data?.consolidated ?? {};
      for (const [code, amount] of Object.entries(cons)) {
        map.set(`${code}:consolidated`, amount);
      }
    }

    if (tab === "efe") {
      // EFE: sections have code (A, B, C, D, E, F1, F2)
      for (const cr of perCompany) {
        const sections = cr.report?.sections as
          | Array<{
              code: string;
              amount: number;
              children?: Array<{ label: string; amount: number }>;
            }>
          | undefined;
        if (!sections) continue;
        for (const section of sections) {
          map.set(`${section.code}:${cr.company.id}`, section.amount);
          // Map children to EFE_STRUCTURE sub-codes
          if (section.children) {
            for (const child of section.children) {
              // Match child label to EFE_STRUCTURE codes by label prefix
              const matchingTpl = EFE_STRUCTURE.find(
                (tpl) =>
                  tpl.label &&
                  child.label &&
                  tpl.label.substring(0, 20) === child.label.substring(0, 20)
              );
              if (matchingTpl) {
                map.set(`${matchingTpl.code}:${cr.company.id}`, child.amount);
              }
            }
          }
        }
        // Map totals
        const totals = cr.report?.totals as Record<string, number> | undefined;
        if (totals) {
          if (totals.flujosExplotacion != null)
            map.set(`A:${cr.company.id}`, totals.flujosExplotacion);
          if (totals.flujosInversion != null) map.set(`B:${cr.company.id}`, totals.flujosInversion);
          if (totals.flujosFinanciacion != null)
            map.set(`C:${cr.company.id}`, totals.flujosFinanciacion);
          if (totals.aumentoDisminucionEfectivo != null)
            map.set(`E:${cr.company.id}`, totals.aumentoDisminucionEfectivo);
          if (totals.efectivoInicio != null) map.set(`F1:${cr.company.id}`, totals.efectivoInicio);
          if (totals.efectivoFinal != null) map.set(`F2:${cr.company.id}`, totals.efectivoFinal);
        }
      }
      // Consolidated EFE
      const cons = data?.consolidated ?? {};
      for (const [code, amount] of Object.entries(cons)) {
        map.set(`${code}:consolidated`, amount);
      }
    }

    return { dataMap: map, columns: cols };
  }, [data, perCompany, tab]);

  const structure =
    tab === "pyg" ? PYG_STRUCTURE : tab === "balance" ? BALANCE_STRUCTURE : EFE_STRUCTURE;

  const tabs: { key: Tab; label: string }[] = [
    { key: "pyg", label: "PyG consolidada" },
    { key: "balance", label: "Balance consolidado" },
    { key: "efe", label: "EFE consolidado" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Consolidado" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Reportes consolidados</h1>
          <div className="flex items-center gap-2 bg-white border border-subtle rounded-md px-3 h-8">
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
              <ChevronLeft size={16} className="text-text-secondary" />
            </button>
            <span className="text-[13px] font-medium text-text-primary capitalize w-24 text-center">
              {formatPeriodLabel(date)}
            </span>
            <button onClick={() => setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <ChevronRight size={16} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-subtle">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSpinner />
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Layers size={40} className="text-text-tertiary mb-3" />
            <p className="text-[13px] text-text-secondary">No hay datos de consolidación.</p>
            <p className="text-[11px] text-text-tertiary mt-1">
              Necesitas al menos 2 sociedades en la organización.
            </p>
          </div>
        ) : (
          <>
            {/* Company legend */}
            <div className="flex items-center gap-4 text-[11px] text-text-tertiary">
              {companies.map((co) => (
                <span key={co.id}>
                  <span className="font-medium text-text-secondary">{co.name}</span>
                  {co.method && co.method !== "FULL" && (
                    <span className="ml-1">
                      ({co.method === "EQUITY" ? "Eq." : "Prop."} {co.ownership ?? 100}%)
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* PGC Table */}
            <PgcTable structure={structure} data={dataMap} columns={columns} />

            {/* Eliminations (PyG only) */}
            {tab === "pyg" && (data?.eliminationDetails?.length ?? 0) > 0 && data && (
              <div className="bg-white rounded-lg border border-subtle p-4">
                <h3 className="text-xs font-semibold text-text-secondary mb-2">
                  Eliminaciones intercompañía
                </h3>
                {data.eliminationDetails!.map((elim, i) => (
                  <div
                    key={i}
                    className="flex items-center h-9 px-4 text-xs border-b border-border-light last:border-0"
                  >
                    <span className="flex-1 text-text-secondary">
                      {elim.companyA.name} ↔ {elim.companyB.name}
                    </span>
                    <span className="text-[10px] text-amber-600 mr-3">{elim.type}</span>
                    <span className="font-mono text-red-600">
                      -{formatAmount(elim.eliminationAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* NCI (PyG only) */}
            {tab === "pyg" && data?.nci != null && data.nci !== 0 && (
              <div className="flex items-center justify-between px-5 py-2 bg-amber-50 rounded-lg text-sm">
                <span className="text-amber-700 font-medium">Intereses minoritarios (NCI)</span>
                <span className="font-mono text-amber-700">{formatAmount(data.nci)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
