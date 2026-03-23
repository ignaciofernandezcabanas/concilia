"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";

interface AgingBucket {
  label: string;
  amount: number;
  percentage: number;
}

interface AgingContact {
  contactId: string;
  contactName: string;
  cif: string | null;
  buckets: number[];
  total: number;
  invoiceCount: number;
  avgDaysOverdue: number;
  oldestDueDate: string | null;
}

interface AgingResponse {
  type: string;
  asOf: string;
  summary: {
    buckets: AgingBucket[];
    totalAmount: number;
    invoiceCount: number;
    contactCount: number;
    dso?: number;
    dpo?: number;
    weightedAvgDaysOverdue: number;
  };
  contacts: AgingContact[];
}

type Tab = "receivable" | "payable";

const BUCKET_COLORS = ["bg-green", "bg-green/60", "bg-amber", "bg-red/70", "bg-red"];
const BUCKET_TEXT = ["text-green-text", "text-green-text", "text-amber", "text-red-text", "text-red-text"];

export default function CuentasCobrarPage() {
  const [tab, setTab] = useState<Tab>("receivable");
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  const { data, loading } = useFetch<AgingResponse>(
    `/api/reports/aging${qs({ type: tab })}`,
    [tab]
  );

  const summary = data?.summary;
  const contacts = data?.contacts ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Cuentas a cobrar / pagar" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-subtle">
          <button
            onClick={() => setTab("receivable")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "receivable" ? "border-accent text-accent" : "border-transparent text-text-secondary"
            }`}
          >
            Cuentas a cobrar
          </button>
          <button
            onClick={() => setTab("payable")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "payable" ? "border-accent text-accent" : "border-transparent text-text-secondary"
            }`}
          >
            Cuentas a pagar
          </button>
        </div>

        {loading ? <LoadingSpinner /> : !summary ? (
          <p className="text-[13px] text-text-tertiary text-center py-12">Sin datos.</p>
        ) : (
          <>
            {/* Summary buckets */}
            <div className="grid grid-cols-6 gap-3">
              <BucketCard label="Total" amount={summary.totalAmount} count={summary.invoiceCount} accent />
              {summary.buckets.map((b, i) => (
                <BucketCard key={i} label={b.label} amount={b.amount} pct={b.percentage} colorIdx={i} />
              ))}
            </div>

            {/* KPIs row */}
            <div className="flex items-center gap-6 text-[12px]">
              <span className="text-text-tertiary">
                {tab === "receivable" ? "DSO" : "DPO"}:{" "}
                <span className="font-semibold text-text-primary">{summary.dso ?? summary.dpo ?? "—"} días</span>
              </span>
              <span className="text-text-tertiary">
                Días medios mora: <span className="font-semibold text-text-primary">{summary.weightedAvgDaysOverdue}</span>
              </span>
              <span className="text-text-tertiary">
                Contactos: <span className="font-semibold text-text-primary">{summary.contactCount}</span>
              </span>
            </div>

            {/* Contact table */}
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                <span className="w-6" />
                <span className="flex-1">Contacto</span>
                <span className="w-24 text-right">Total</span>
                <span className="w-20 text-right">Corriente</span>
                <span className="w-20 text-right">0-30d</span>
                <span className="w-20 text-right">31-60d</span>
                <span className="w-20 text-right">61-90d</span>
                <span className="w-20 text-right">&gt;90d</span>
                <span className="w-16 text-center">Riesgo</span>
              </div>
              {contacts.map((c) => {
                const expanded = expandedContact === c.contactId;
                const risk = c.avgDaysOverdue > 60 ? "Alto" : c.avgDaysOverdue > 30 ? "Medio" : "Bajo";
                const riskColor = risk === "Alto" ? "bg-red text-white" : risk === "Medio" ? "bg-amber text-white" : "bg-green text-white";

                return (
                  <div key={c.contactId}>
                    <div
                      className="flex items-center h-11 px-5 border-b border-border-light text-[12px] hover:bg-page cursor-pointer transition-colors"
                      onClick={() => setExpandedContact(expanded ? null : c.contactId)}
                    >
                      <span className="w-6 text-text-tertiary">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <div className="flex-1">
                        <span className="text-[13px] font-medium text-text-primary">{c.contactName}</span>
                        {c.cif && <span className="text-[10px] text-text-tertiary ml-2">{c.cif}</span>}
                      </div>
                      <span className="w-24 text-right font-mono font-semibold">{formatAmount(c.total)}</span>
                      {c.buckets.map((b, i) => (
                        <span key={i} className={`w-20 text-right font-mono ${b > 0 ? BUCKET_TEXT[i] : "text-text-tertiary"}`}>
                          {b > 0 ? formatAmount(b) : "—"}
                        </span>
                      ))}
                      <span className="w-16 flex justify-center">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${riskColor}`}>{risk}</span>
                      </span>
                    </div>
                    {expanded && (
                      <div className="bg-page border-b border-subtle px-5 pl-12 py-2">
                        <p className="text-[11px] text-text-tertiary">
                          {c.invoiceCount} facturas pendientes · Mora media: {c.avgDaysOverdue} días
                          {c.oldestDueDate && ` · Más antigua: ${new Date(c.oldestDueDate).toLocaleDateString("es-ES")}`}
                        </p>
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

function BucketCard({ label, amount, count, pct, accent, colorIdx }: {
  label: string; amount: number; count?: number; pct?: number; accent?: boolean; colorIdx?: number;
}) {
  const dotColor = colorIdx != null ? BUCKET_COLORS[colorIdx] : "bg-accent";
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-accent bg-accent/5" : "border-subtle bg-white"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {!accent && <div className={`w-2 h-2 rounded-full ${dotColor}`} />}
        <span className="text-[10px] text-text-tertiary">{label}</span>
      </div>
      <span className={`text-[16px] font-semibold font-mono ${accent ? "text-accent" : "text-text-primary"}`}>
        {formatAmount(amount)}
      </span>
      {count != null && <span className="text-[10px] text-text-tertiary block">{count} facturas</span>}
      {pct != null && <span className="text-[10px] text-text-tertiary block">{pct}%</span>}
    </div>
  );
}
