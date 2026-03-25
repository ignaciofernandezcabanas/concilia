"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { api, qs } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import { ChevronDown, ChevronRight } from "lucide-react";

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

type Tab = "receivable" | "payable" | "impagados";

const BUCKET_COLORS = ["bg-green", "bg-green/60", "bg-amber", "bg-red/70", "bg-red"];
const BUCKET_TEXT = [
  "text-green-text",
  "text-green-text",
  "text-amber",
  "text-red-text",
  "text-red-text",
];

export default function CuentasCobrarPage() {
  const [tab, setTab] = useState<Tab>("receivable");
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  const { data, loading } = useFetch<AgingResponse>(`/api/reports/aging${qs({ type: tab })}`, [
    tab,
  ]);

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
              tab === "receivable"
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary"
            }`}
          >
            Cuentas a cobrar
          </button>
          <button
            onClick={() => setTab("payable")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "payable"
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary"
            }`}
          >
            Cuentas a pagar
          </button>
          <button
            onClick={() => setTab("impagados")}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === "impagados"
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary"
            }`}
          >
            Impagados
          </button>
        </div>

        {tab === "impagados" ? (
          <ImpagadosView />
        ) : loading ? (
          <LoadingSpinner />
        ) : !summary ? (
          <p className="text-[13px] text-text-tertiary text-center py-12">Sin datos.</p>
        ) : (
          <>
            {/* Summary buckets */}
            <div className="grid grid-cols-6 gap-3">
              <BucketCard
                label="Total"
                amount={summary.totalAmount}
                count={summary.invoiceCount}
                accent
              />
              {summary.buckets.map((b, i) => (
                <BucketCard
                  key={i}
                  label={b.label}
                  amount={b.amount}
                  pct={b.percentage}
                  colorIdx={i}
                />
              ))}
            </div>

            {/* KPIs row */}
            <div className="flex items-center gap-6 text-[12px]">
              <span className="text-text-tertiary">
                {tab === "receivable" ? "DSO" : "DPO"}:{" "}
                <span className="font-semibold text-text-primary">
                  {summary.dso ?? summary.dpo ?? "—"} días
                </span>
              </span>
              <span className="text-text-tertiary">
                Días medios mora:{" "}
                <span className="font-semibold text-text-primary">
                  {summary.weightedAvgDaysOverdue}
                </span>
              </span>
              <span className="text-text-tertiary">
                Contactos:{" "}
                <span className="font-semibold text-text-primary">{summary.contactCount}</span>
              </span>
            </div>

            {/* Contact table */}
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                <span className="w-6" />
                <span className="flex-1">Contacto</span>
                <span className="w-24 text-right font-mono">Total</span>
                <span className="w-24 text-right font-mono">Corriente</span>
                <span className="w-24 text-right font-mono">0-30d</span>
                <span className="w-24 text-right font-mono">31-60d</span>
                <span className="w-24 text-right font-mono">61-90d</span>
                <span className="w-24 text-right font-mono">&gt;90d</span>
                <span className="w-16 text-center">Riesgo</span>
              </div>
              {contacts.map((c) => {
                const expanded = expandedContact === c.contactId;
                const risk =
                  c.avgDaysOverdue > 60 ? "Alto" : c.avgDaysOverdue > 30 ? "Medio" : "Bajo";
                const riskColor =
                  risk === "Alto"
                    ? "bg-red text-white"
                    : risk === "Medio"
                      ? "bg-amber text-white"
                      : "bg-green text-white";

                return (
                  <div key={c.contactId}>
                    <div
                      className="flex items-center h-11 px-5 border-b border-border-light text-[12px] hover:bg-page cursor-pointer transition-colors"
                      onClick={() => setExpandedContact(expanded ? null : c.contactId)}
                    >
                      <span className="w-6 text-text-tertiary">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium text-text-primary truncate block">
                          {c.contactName}
                        </span>
                        {c.cif && (
                          <span className="text-[10px] text-text-tertiary ml-2 w-24 inline-block">
                            {c.cif}
                          </span>
                        )}
                      </div>
                      <span className="w-24 text-right font-mono font-semibold">
                        {formatAmount(c.total)}
                      </span>
                      {c.buckets.map((b, i) => (
                        <span
                          key={i}
                          className={`w-24 text-right font-mono ${b > 0 ? BUCKET_TEXT[i] : "text-text-tertiary"}`}
                        >
                          {b > 0 ? formatAmount(b) : "—"}
                        </span>
                      ))}
                      <span className="w-16 flex justify-center">
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${riskColor}`}
                        >
                          {risk}
                        </span>
                      </span>
                    </div>
                    {expanded && (
                      <div className="bg-page border-b border-subtle px-5 pl-12 py-2">
                        <p className="text-[11px] text-text-tertiary">
                          {c.invoiceCount} facturas pendientes · Mora media: {c.avgDaysOverdue} días
                          {c.oldestDueDate &&
                            ` · Más antigua: ${new Date(c.oldestDueDate).toLocaleDateString("es-ES")}`}
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

// ── Impagados (Bad Debts) view ──

interface BadDebtTracker {
  id: string;
  status: string;
  overdueMonths: number;
  provisionAmount: number | null;
  claimType: string | null;
  claimDate: string | null;
  claimReference: string | null;
  invoice: {
    number: string;
    totalAmount: number;
    amountPaid: number;
    dueDate: string | null;
    contact: { name: string; cif: string | null } | null;
  };
}

const BD_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  MONITORING: { bg: "bg-gray-100", text: "text-gray-600", label: "Monitorizando" },
  PROVISION_ACCOUNTING: { bg: "bg-amber-100", text: "text-amber-700", label: "Prov. contable" },
  PROVISION_TAX: { bg: "bg-green/10", text: "text-green-text", label: "Prov. fiscal" },
  RECOVERED: { bg: "bg-blue-100", text: "text-blue-700", label: "Recuperado" },
  WRITTEN_OFF: { bg: "bg-red/10", text: "text-red-text", label: "Fallido" },
};

function ImpagadosView() {
  const { data, loading, refetch } = useFetch<{ data: BadDebtTracker[] }>("/api/bad-debts", []);
  const [claimModal, setClaimModal] = useState<BadDebtTracker | null>(null);
  const [claimType, setClaimType] = useState("BUROFAX");
  const [claimDate, setClaimDate] = useState("");
  const [claimRef, setClaimRef] = useState("");
  const [saving, setSaving] = useState(false);

  const trackers = data?.data ?? [];

  async function handleClaim() {
    if (!claimModal) return;
    setSaving(true);
    try {
      await api.put("/api/bad-debts", {
        id: claimModal.id,
        claimType,
        claimDate: claimDate ? new Date(claimDate).toISOString() : undefined,
        claimReference: claimRef || undefined,
        status: "PROVISION_TAX",
      });
      setClaimModal(null);
      setClaimType("BUROFAX");
      setClaimDate("");
      setClaimRef("");
      refetch();
    } catch (err) {
      console.error("Claim error:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  if (trackers.length === 0) {
    return (
      <p className="text-[13px] text-text-tertiary text-center py-12">
        No hay impagados registrados.
      </p>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-subtle overflow-hidden">
        <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
          <span className="w-28">Factura</span>
          <span className="flex-1">Contacto</span>
          <span className="w-28 text-right">Vencimiento</span>
          <span className="w-28 text-right font-mono">Importe</span>
          <span className="w-32 text-center">Estado fiscal</span>
          <span className="w-36 text-right">Acciones</span>
        </div>
        {trackers.map((t) => {
          const style = BD_STATUS_STYLE[t.status] ?? BD_STATUS_STYLE.MONITORING;
          const canClaim = t.status === "MONITORING" || t.status === "PROVISION_ACCOUNTING";

          return (
            <div
              key={t.id}
              className="flex items-center h-11 px-5 border-b border-border-light text-[12px] hover:bg-hover transition-colors"
            >
              <span className="w-28 font-medium text-accent">{t.invoice.number}</span>
              <div className="flex-1 min-w-0">
                <span className="text-text-primary truncate block">
                  {t.invoice.contact?.name ?? "—"}
                </span>
                {t.invoice.contact?.cif && (
                  <span className="text-[10px] text-text-tertiary ml-1.5">
                    {t.invoice.contact.cif}
                  </span>
                )}
              </div>
              <span className="w-28 text-right text-text-secondary">
                {t.invoice.dueDate ? formatDate(t.invoice.dueDate) : "—"}
              </span>
              <span className="w-28 text-right font-mono font-medium">
                {formatAmount(t.invoice.totalAmount)}
              </span>
              <span className="w-32 flex justify-center">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
              </span>
              <span className="w-36 flex justify-end">
                {canClaim && (
                  <button
                    onClick={() => setClaimModal(t)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20"
                  >
                    Registrar reclamacion
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Claim registration modal */}
      {claimModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-subtle p-5 w-[420px] space-y-4">
            <h3 className="text-[15px] font-semibold text-text-primary">Registrar reclamacion</h3>
            <p className="text-[12px] text-text-secondary">
              Factura {claimModal.invoice.number} — {formatAmount(claimModal.invoice.totalAmount)}
            </p>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Tipo de reclamacion
              </label>
              <select
                value={claimType}
                onChange={(e) => setClaimType(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
              >
                <option value="BUROFAX">Burofax</option>
                <option value="JUDICIAL">Judicial</option>
                <option value="NOTARIAL">Notarial</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Fecha</label>
              <input
                type="date"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Referencia
              </label>
              <input
                type="text"
                value={claimRef}
                onChange={(e) => setClaimRef(e.target.value)}
                placeholder="Numero de referencia..."
                className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleClaim}
                disabled={saving || !claimDate}
                className="flex-1 h-9 bg-accent text-white text-[13px] font-medium rounded-md disabled:opacity-50"
              >
                {saving ? "Registrando..." : "Confirmar reclamacion"}
              </button>
              <button
                onClick={() => setClaimModal(null)}
                className="h-9 px-4 text-[13px] text-text-secondary border border-subtle rounded-md"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BucketCard({
  label,
  amount,
  count,
  pct,
  accent,
  colorIdx,
}: {
  label: string;
  amount: number;
  count?: number;
  pct?: number;
  accent?: boolean;
  colorIdx?: number;
}) {
  const dotColor = colorIdx != null ? BUCKET_COLORS[colorIdx] : "bg-accent";
  return (
    <div
      className={`rounded-lg border p-3 ${accent ? "border-accent bg-accent/5" : "border-subtle bg-white"}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {!accent && <div className={`w-2 h-2 rounded-full ${dotColor}`} />}
        <span className="text-[10px] text-text-tertiary">{label}</span>
      </div>
      <span
        className={`text-[16px] font-semibold font-mono ${accent ? "text-accent" : "text-text-primary"}`}
      >
        {formatAmount(amount)}
      </span>
      {count != null && (
        <span className="text-[10px] text-text-tertiary block">{count} facturas</span>
      )}
      {pct != null && <span className="text-[10px] text-text-tertiary block">{pct}%</span>}
    </div>
  );
}
