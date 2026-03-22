"use client";

import type { PgcLineTemplate } from "@/lib/pgc-structure";

const fmtAmount = (val: number): string => {
  if (val === 0) return "0,00";
  const abs = Math.abs(val);
  const s = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return val < 0 ? `(${s})` : s;
};

const amtColor = (val: number): string =>
  val < 0 ? "text-red-text" : val === 0 ? "text-text-tertiary" : "text-text-primary";

interface Column {
  key: string;
  label: string;
}

interface Props {
  structure: PgcLineTemplate[];
  /** Map of "lineCode" -> amount (single column) OR "lineCode:columnKey" -> amount (multi column) */
  data: Map<string, number>;
  /** Column headers. If empty, single "Importe" column. */
  columns?: Column[];
  /** Optional percentage column (code -> pct) */
  pctData?: Map<string, number>;
}

export default function PgcTable({ structure, data, columns, pctData }: Props) {
  const cols = columns && columns.length > 0 ? columns : [{ key: "_", label: "Importe" }];
  const multiCol = columns && columns.length > 0;

  const getVal = (code: string, colKey: string): number => {
    if (multiCol) return data.get(`${code}:${colKey}`) ?? 0;
    return data.get(code) ?? 0;
  };

  return (
    <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
      {/* Column headers */}
      <div className="flex items-center h-10 px-6 bg-subtotal border-b border-subtle">
        <span className="flex-1 text-xs font-semibold text-text-secondary">Partida</span>
        {cols.map((col) => (
          <span key={col.key} className="w-[110px] text-right text-xs font-semibold text-text-secondary capitalize">
            {col.label}
          </span>
        ))}
        {pctData && <span className="w-[50px] text-right text-xs font-semibold text-text-secondary">%</span>}
      </div>

      {structure.map((tpl) => {
        // Section header
        if (tpl.type === "section") {
          return (
            <div key={tpl.code} className="flex items-center h-9 px-6 bg-subtotal border-t border-subtle">
              <span className="text-xs font-bold text-text-secondary tracking-wide">{tpl.label}</span>
            </div>
          );
        }

        // Result / Total row
        if (tpl.type === "result" || tpl.type === "total") {
          return (
            <div key={tpl.code} className="flex items-center h-10 px-6 bg-subtotal border-t border-subtle">
              <span className="flex-1 font-bold text-text-primary text-[13px]">
                {tpl.label}
                {tpl.accounts && <span className="text-text-tertiary font-normal text-[11px] ml-1">({tpl.accounts})</span>}
              </span>
              {cols.map((col) => {
                const val = getVal(tpl.code, col.key);
                return (
                  <span key={col.key} className={`w-[110px] text-right font-mono font-semibold ${amtColor(val)}`}>
                    {fmtAmount(val)}
                  </span>
                );
              })}
              {pctData && (
                <span className="w-[50px] text-right text-xs text-text-secondary">
                  {pctData.get(tpl.code) != null && pctData.get(tpl.code) !== 0 ? `${pctData.get(tpl.code)!.toFixed(1)}%` : ""}
                </span>
              )}
            </div>
          );
        }

        // EBITDA
        if (tpl.type === "ebitda") {
          return (
            <div key={tpl.code} className="flex items-center h-9 px-6 border-t border-subtle" style={{ paddingLeft: 48 }}>
              <span className="flex-1 italic text-text-secondary text-[13px]">{tpl.label}</span>
              {cols.map((col) => {
                const val = getVal(tpl.code, col.key);
                return (
                  <span key={col.key} className={`w-[110px] text-right font-mono font-medium ${amtColor(val)}`}>
                    {fmtAmount(val)}
                  </span>
                );
              })}
              {pctData && <span className="w-[50px]" />}
            </div>
          );
        }

        // Sub-line
        if (tpl.type === "sub") {
          const indent = (tpl.indent ?? 0) * 24 + 48;
          return (
            <div key={tpl.code} className="flex items-center h-8 px-6" style={{ paddingLeft: indent }}>
              <span className="flex-1 text-[12px] text-text-secondary">
                {tpl.label}
                {tpl.accounts && <span className="text-text-tertiary text-[11px] ml-1">({tpl.accounts})</span>}
              </span>
              {cols.map((col) => {
                const val = getVal(tpl.code, col.key);
                return (
                  <span key={col.key} className={`w-[110px] text-right text-[12px] font-mono ${amtColor(val)}`}>
                    {fmtAmount(val)}
                  </span>
                );
              })}
              {pctData && <span className="w-[50px]" />}
            </div>
          );
        }

        // Normal line
        const indent = (tpl.indent ?? 0) * 24 + 24;
        return (
          <div key={tpl.code} className="flex items-center h-9 px-6 border-b border-border-light" style={{ paddingLeft: indent }}>
            <span className="flex-1 font-medium text-text-primary text-[13px]">
              {tpl.label}
              {tpl.accounts && <span className="text-text-tertiary font-normal text-[11px] ml-1">({tpl.accounts})</span>}
            </span>
            {cols.map((col) => {
              const val = getVal(tpl.code, col.key);
              return (
                <span key={col.key} className={`w-[110px] text-right font-mono font-medium ${amtColor(val)}`}>
                  {fmtAmount(val)}
                </span>
              );
            })}
            {pctData && (
              <span className="w-[50px] text-right text-xs text-text-secondary">
                {pctData.get(tpl.code) != null && pctData.get(tpl.code) !== 0 ? `${pctData.get(tpl.code)!.toFixed(1)}%` : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
