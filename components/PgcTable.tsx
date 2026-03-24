"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Loader2, Eye } from "lucide-react";
import { api, qs } from "@/lib/api-client";
import InvoicePdfModal from "@/components/InvoicePdfModal";
import type { PgcLineTemplate } from "@/lib/pgc-structure";

const fmtAmount = (val: number): string => {
  if (val === 0) return "0,00";
  const abs = Math.abs(val);
  const s = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return val < 0 ? `(${s})` : s;
};

const amtColor = (val: number): string =>
  val < 0 ? "text-red-text" : val === 0 ? "text-text-tertiary" : "text-text-primary";

interface Column {
  key: string;
  label: string;
}

interface DrilldownConfig {
  report: "pyg" | "cashflow" | "balance";
  from?: string;
  to?: string;
  asOf?: string;
}

interface DrilldownAccount {
  accountCode: string;
  accountName: string;
  amount: number;
  transactionCount: number;
}
interface DrilldownTransaction {
  type: string;
  id: string;
  date: string;
  description: string;
  amount: number;
  invoiceNumber?: string;
  contactName?: string;
  counterpartName?: string;
}
interface DrilldownResponse {
  level: string;
  items: DrilldownAccount[] | DrilldownTransaction[];
  accountCode?: string;
  accountName?: string;
}

interface Props {
  structure: PgcLineTemplate[];
  data: Map<string, number>;
  columns?: Column[];
  pctData?: Map<string, number>;
  drilldown?: DrilldownConfig;
}

export default function PgcTable({ structure, data, columns, pctData, drilldown }: Props) {
  const cols = columns && columns.length > 0 ? columns : [{ key: "_", label: "Importe" }];
  const multiCol = columns && columns.length > 0;

  const getVal = (code: string, colKey: string): number => {
    if (multiCol) return data.get(`${code}:${colKey}`) ?? 0;
    return data.get(code) ?? 0;
  };

  // Drill-down state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillData, setDrillData] = useState<Map<string, DrilldownResponse>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [expandedAccts, setExpandedAccts] = useState<Set<string>>(new Set());
  const [viewingPdf, setViewingPdf] = useState<{ id: string; number: string } | null>(null);
  const [acctDrillData, setAcctDrillData] = useState<Map<string, DrilldownResponse>>(new Map());
  const [acctLoading, setAcctLoading] = useState<Set<string>>(new Set());

  async function toggleExpand(code: string, tpl?: PgcLineTemplate) {
    if (!drilldown) return;
    const next = new Set(expanded);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
      if (!drillData.has(code)) {
        setLoading((p) => new Set(p).add(code));
        try {
          // Sub-lines with accounts → drill directly to transactions using first account code
          const firstAccount = tpl?.accounts?.split(",")[0]?.trim().replace("*", "");
          const params = firstAccount
            ? {
                report: drilldown.report,
                account: firstAccount,
                from: drilldown.from,
                to: drilldown.to,
                asOf: drilldown.asOf,
              }
            : {
                report: drilldown.report,
                code,
                from: drilldown.from,
                to: drilldown.to,
                asOf: drilldown.asOf,
              };
          const res = await api.get<DrilldownResponse>(`/api/reports/drilldown${qs(params)}`);
          setDrillData((p) => new Map(p).set(code, res));
        } catch {
          /* ignore */
        } finally {
          setLoading((p) => {
            const s = new Set(p);
            s.delete(code);
            return s;
          });
        }
      }
    }
    setExpanded(next);
  }

  async function toggleAcctExpand(parentCode: string, accountCode: string) {
    if (!drilldown) return;
    const key = `${parentCode}:${accountCode}`;
    const next = new Set(expandedAccts);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      if (!acctDrillData.has(key)) {
        setAcctLoading((p) => new Set(p).add(key));
        try {
          const res = await api.get<DrilldownResponse>(
            `/api/reports/drilldown${qs({ report: drilldown.report, account: accountCode, from: drilldown.from, to: drilldown.to, asOf: drilldown.asOf })}`
          );
          setAcctDrillData((p) => new Map(p).set(key, res));
        } catch {
          /* ignore */
        } finally {
          setAcctLoading((p) => {
            const s = new Set(p);
            s.delete(key);
            return s;
          });
        }
      }
    }
    setExpandedAccts(next);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canExpand = (code: string, _tpl?: unknown): boolean => {
    if (!drilldown) return false;
    // Only expand if there's a non-zero value (no point drilling into 0)
    return cols.some((col) => getVal(code, col.key) !== 0);
  };

  return (
    <div className="bg-white rounded-lg border border-subtle overflow-hidden text-[13px]">
      {/* Column headers */}
      <div className="flex items-center h-10 px-6 bg-subtotal border-b border-subtle">
        <span className="flex-1 text-xs font-semibold text-text-secondary">Partida</span>
        {cols.map((col) => (
          <span
            key={col.key}
            className="w-[110px] text-right text-xs font-semibold text-text-secondary capitalize"
          >
            {col.label}
          </span>
        ))}
        {pctData && (
          <span className="w-[50px] text-right text-xs font-semibold text-text-secondary">%</span>
        )}
      </div>

      {structure.map((tpl) => {
        const isExpandable =
          (tpl.type === "line" || tpl.type === "sub") && canExpand(tpl.code, tpl);
        const isExpanded = expanded.has(tpl.code);

        // Section header
        if (tpl.type === "section") {
          return (
            <div
              key={tpl.code}
              className="flex items-center h-9 px-6 bg-subtotal border-t border-subtle"
            >
              <span className="text-xs font-bold text-text-secondary tracking-wide">
                {tpl.label}
              </span>
            </div>
          );
        }

        // Result / Total
        if (tpl.type === "result" || tpl.type === "total") {
          return (
            <div
              key={tpl.code}
              className="flex items-center h-10 px-6 bg-subtotal border-t border-subtle"
            >
              <span className="flex-1 font-bold text-text-primary text-[13px]">
                {tpl.label}
                {tpl.accounts && (
                  <span className="text-text-tertiary font-normal text-[11px] ml-1">
                    ({tpl.accounts})
                  </span>
                )}
              </span>
              {cols.map((col) => {
                const val = getVal(tpl.code, col.key);
                return (
                  <span
                    key={col.key}
                    className={`w-[110px] text-right font-mono font-semibold ${amtColor(val)}`}
                  >
                    {fmtAmount(val)}
                  </span>
                );
              })}
              {pctData && (
                <span className="w-[50px] text-right text-xs text-text-secondary">
                  {pctData.get(tpl.code) != null && pctData.get(tpl.code) !== 0
                    ? `${pctData.get(tpl.code)!.toFixed(1)}%`
                    : ""}
                </span>
              )}
            </div>
          );
        }

        // EBITDA
        if (tpl.type === "ebitda") {
          return (
            <div
              key={tpl.code}
              className="flex items-center h-9 px-6 border-t border-subtle"
              style={{ paddingLeft: 48 }}
            >
              <span className="flex-1 italic text-text-secondary text-[13px]">{tpl.label}</span>
              {cols.map((col) => {
                const val = getVal(tpl.code, col.key);
                return (
                  <span
                    key={col.key}
                    className={`w-[110px] text-right font-mono font-medium ${amtColor(val)}`}
                  >
                    {fmtAmount(val)}
                  </span>
                );
              })}
            </div>
          );
        }

        // Sub-line (expandable if has amount and accounts)
        if (tpl.type === "sub") {
          const indent = (tpl.indent ?? 0) * 24 + 48;
          const subExpandable = drilldown && tpl.accounts && canExpand(tpl.code, tpl);
          const subExpanded = expanded.has(tpl.code);

          return (
            <div key={tpl.code}>
              <div
                className={`flex items-center h-8 px-6 ${subExpandable ? "cursor-pointer hover:bg-page" : ""}`}
                style={{ paddingLeft: indent }}
                onClick={subExpandable ? () => toggleExpand(tpl.code, tpl) : undefined}
              >
                <span className="w-4 shrink-0">
                  {subExpandable &&
                    (loading.has(tpl.code) ? (
                      <Loader2 size={10} className="text-text-tertiary animate-spin" />
                    ) : subExpanded ? (
                      <ChevronDown size={10} className="text-text-secondary" />
                    ) : (
                      <ChevronRight size={10} className="text-text-tertiary" />
                    ))}
                </span>
                <span className="flex-1 text-[12px] text-text-secondary">
                  {tpl.label}
                  {tpl.accounts && (
                    <span className="text-text-tertiary text-[11px] ml-1">({tpl.accounts})</span>
                  )}
                </span>
                {cols.map((col) => {
                  const val = getVal(tpl.code, col.key);
                  return (
                    <span
                      key={col.key}
                      className={`w-[110px] text-right text-[12px] font-mono ${amtColor(val)}`}
                    >
                      {fmtAmount(val)}
                    </span>
                  );
                })}
              </div>

              {/* Drill-down transactions for sub-line */}
              {subExpanded && drillData.has(tpl.code) && (
                <div className="bg-page border-l-2 border-accent ml-14 mr-4 mb-1 rounded overflow-hidden">
                  {drillData.get(tpl.code)!.items.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-text-tertiary">
                      Sin detalle disponible para esta partida
                    </div>
                  ) : drillData.get(tpl.code)!.level === "transactions" ? (
                    (drillData.get(tpl.code)!.items as DrilldownTransaction[]).map((tx, i) => (
                      <div
                        key={tx.id || i}
                        className="flex items-center h-7 px-3 text-[11px] border-b border-border-light"
                      >
                        <span className="w-14 text-text-tertiary">{tx.date.slice(5)}</span>
                        <span className="flex-1 text-text-secondary truncate">
                          {tx.description}
                        </span>
                        <span className={`w-[90px] text-right font-mono ${amtColor(tx.amount)}`}>
                          {fmtAmount(tx.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    (drillData.get(tpl.code)!.items as DrilldownAccount[]).map((acct) => (
                      <div
                        key={acct.accountCode}
                        className="flex items-center h-7 px-3 text-[11px] border-b border-border-light"
                      >
                        <span className="font-mono text-accent w-10">{acct.accountCode}</span>
                        <span className="flex-1 text-text-primary">{acct.accountName}</span>
                        <span className={`w-[90px] text-right font-mono ${amtColor(acct.amount)}`}>
                          {fmtAmount(acct.amount)}
                        </span>
                        <span className="w-8 text-right text-text-tertiary">
                          ({acct.transactionCount})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        }

        // Normal line (expandable)
        const indent = (tpl.indent ?? 0) * 24 + 24;
        return (
          <div key={tpl.code}>
            <div
              className={`flex items-center h-9 px-6 border-b border-border-light ${isExpandable ? "cursor-pointer hover:bg-page" : ""}`}
              style={{ paddingLeft: indent }}
              onClick={isExpandable ? () => toggleExpand(tpl.code, tpl) : undefined}
            >
              {/* Chevron */}
              <span className="w-5 shrink-0">
                {isExpandable &&
                  (loading.has(tpl.code) ? (
                    <Loader2 size={12} className="text-text-tertiary animate-spin" />
                  ) : isExpanded ? (
                    <ChevronDown size={12} className="text-text-secondary" />
                  ) : (
                    <ChevronRight size={12} className="text-text-tertiary" />
                  ))}
              </span>
              <span className="flex-1 font-medium text-text-primary text-[13px]">
                {tpl.label}
                {tpl.accounts && (
                  <span className="text-text-tertiary font-normal text-[11px] ml-1">
                    ({tpl.accounts})
                  </span>
                )}
              </span>
              {cols.map((col) => {
                const val = getVal(tpl.code, col.key);
                return (
                  <span
                    key={col.key}
                    className={`w-[110px] text-right font-mono font-medium ${amtColor(val)}`}
                  >
                    {fmtAmount(val)}
                  </span>
                );
              })}
              {pctData && (
                <span className="w-[50px] text-right text-xs text-text-secondary">
                  {pctData.get(tpl.code) != null && pctData.get(tpl.code) !== 0
                    ? `${pctData.get(tpl.code)!.toFixed(1)}%`
                    : ""}
                </span>
              )}
            </div>

            {/* Level 1 drill-down: accounts */}
            {isExpanded && drillData.has(tpl.code) && (
              <div className="bg-page border-l-2 border-accent ml-10 mr-4 mb-2 rounded overflow-hidden">
                {drillData.get(tpl.code)!.items.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-text-tertiary">
                    Sin detalle disponible para esta partida
                  </div>
                ) : (
                  (drillData.get(tpl.code)!.items as DrilldownAccount[]).map((acct) => {
                    const acctKey = `${tpl.code}:${acct.accountCode}`;
                    const acctExpanded = expandedAccts.has(acctKey);
                    return (
                      <div key={acct.accountCode}>
                        <div
                          className="flex items-center h-8 px-3 text-[12px] hover:bg-hover cursor-pointer border-b border-border-light"
                          onClick={() => toggleAcctExpand(tpl.code, acct.accountCode)}
                        >
                          <span className="w-4 shrink-0">
                            {acctLoading.has(acctKey) ? (
                              <Loader2 size={10} className="text-text-tertiary animate-spin" />
                            ) : acctExpanded ? (
                              <ChevronDown size={10} className="text-text-secondary" />
                            ) : (
                              <ChevronRight size={10} className="text-text-tertiary" />
                            )}
                          </span>
                          <span className="font-mono text-accent w-10">{acct.accountCode}</span>
                          <span className="flex-1 text-text-primary">{acct.accountName}</span>
                          <span
                            className={`w-[100px] text-right font-mono ${amtColor(acct.amount)}`}
                          >
                            {fmtAmount(acct.amount)}
                          </span>
                          <span className="w-10 text-right text-text-tertiary text-[11px]">
                            ({acct.transactionCount})
                          </span>
                        </div>

                        {/* Level 2: individual transactions */}
                        {acctExpanded && acctDrillData.has(acctKey) && (
                          <div className="bg-white ml-6 border-l border-subtle">
                            {(acctDrillData.get(acctKey)!.items as DrilldownTransaction[]).map(
                              (tx, i) => (
                                <div
                                  key={tx.id || i}
                                  className="flex items-center h-7 px-3 text-[11px] border-b border-border-light group"
                                >
                                  <span className="w-14 text-text-tertiary">
                                    {tx.date.slice(5)}
                                  </span>
                                  <span className="flex-1 text-text-secondary truncate">
                                    {tx.description}
                                  </span>
                                  {tx.type === "invoice" && tx.id && (
                                    <button
                                      onClick={() =>
                                        setViewingPdf({
                                          id: tx.id,
                                          number: tx.invoiceNumber ?? tx.description,
                                        })
                                      }
                                      className="text-accent hover:text-accent/70 transition-colors mr-2 shrink-0"
                                      title="Ver factura PDF"
                                    >
                                      <Eye size={13} />
                                    </button>
                                  )}
                                  <span
                                    className={`w-[90px] text-right font-mono ${amtColor(tx.amount)}`}
                                  >
                                    {fmtAmount(tx.amount)}
                                  </span>
                                </div>
                              )
                            )}
                            {(acctDrillData.get(acctKey)!.items as DrilldownTransaction[])
                              .length === 100 && (
                              <div className="px-3 py-1 text-[10px] text-text-tertiary">
                                Mostrando primeros 100 registros
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* Invoice PDF Modal */}
      {viewingPdf && (
        <InvoicePdfModal
          invoiceId={viewingPdf.id}
          invoiceNumber={viewingPdf.number}
          onClose={() => setViewingPdf(null)}
        />
      )}
    </div>
  );
}
