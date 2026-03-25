"use client";

import { useState, useEffect } from "react";
import { Briefcase, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { api } from "@/lib/api-client";
import { INVESTMENT_TYPE, INVESTMENT_TX_TYPE, t } from "@/lib/i18n/enums";

interface InvTx {
  id: string;
  type: string;
  date: string;
  amount: number;
  pgcDebitAccount: string;
  pgcCreditAccount: string;
  notes?: string;
}

interface Investment {
  id: string;
  name: string;
  type: string;
  pgcAccount: string;
  isinCif?: string;
  acquisitionDate: string;
  acquisitionCost: number;
  currentValue?: number;
  ownershipPct?: number;
  status: string;
  valuationMethod: string;
  transactions: InvTx[];
}

const TYPE_COLORS: Record<string, string> = {
  EQUITY_SUBSIDIARY: "bg-accent/10 text-accent",
  EQUITY_ASSOCIATE: "bg-amber-100 text-amber-700",
  EQUITY_OTHER: "bg-blue-100 text-blue-700",
  DEBT_INSTRUMENT: "bg-hover text-gray-600",
  LOAN_GRANTED: "bg-purple-100 text-purple-700",
  FUND: "bg-green-100 text-green-700",
};

export default function InversionesPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "EQUITY_OTHER",
    pgcAccount: "250",
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionCost: 0,
    isinCif: "",
    ownershipPct: 0,
  });

  useEffect(() => {
    api
      .get<{ data: Investment[] }>("/api/investments")
      .then((d) => setInvestments(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = formatNumber;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-ES");

  const totalCost = investments.reduce((s, i) => s + i.acquisitionCost, 0);
  const totalValue = investments.reduce((s, i) => s + (i.currentValue ?? i.acquisitionCost), 0);
  const gainLoss = totalValue - totalCost;
  const activeCount = investments.filter((i) => i.status === "ACTIVE").length;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function handleSubmit() {
    setSaving(true);
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          acquisitionCost: Number(form.acquisitionCost),
          ownershipPct: Number(form.ownershipPct) || undefined,
          isinCif: form.isinCif || undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        const d = await fetch("/api/investments").then((r) => r.json());
        setInvestments(d.data ?? []);
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-text-secondary">Cargando inversiones...</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Inversiones</h1>
          <p className="text-sm text-text-secondary mt-1">
            Cartera de participaciones, instrumentos financieros y préstamos concedidos.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90"
        >
          <Plus size={16} /> Registrar inversión
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="border border-border rounded-lg p-4">
          <p className="text-[10px] text-text-tertiary uppercase">Inversiones activas</p>
          <p className="text-xl font-semibold mt-1">{activeCount}</p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-[10px] text-text-tertiary uppercase">Coste de adquisición</p>
          <p className="text-xl font-semibold font-mono mt-1">{fmt(totalCost)} €</p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-[10px] text-text-tertiary uppercase">Valor actual</p>
          <p className="text-xl font-semibold font-mono mt-1">{fmt(totalValue)} €</p>
        </div>
        <div className="border border-border rounded-lg p-4">
          <p className="text-[10px] text-text-tertiary uppercase">Plusvalía / Minusvalía</p>
          <p
            className={`text-xl font-semibold font-mono mt-1 ${gainLoss >= 0 ? "text-green-700" : "text-red-600"}`}
          >
            {gainLoss >= 0 ? "+" : ""}
            {fmt(gainLoss)} €
          </p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-border rounded-lg p-4 bg-page mb-6 space-y-3">
          <h3 className="text-sm font-semibold">Nueva inversión</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nombre *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-border rounded px-3 py-1.5 text-sm"
                placeholder="Participación Empresa X SL"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full border border-border rounded px-3 py-1.5 text-sm"
              >
                {Object.entries(INVESTMENT_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Cuenta PGC</label>
              <input
                value={form.pgcAccount}
                onChange={(e) => setForm((f) => ({ ...f, pgcAccount: e.target.value }))}
                className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Fecha adquisición</label>
              <input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) => setForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
                className="w-full border border-border rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Coste *</label>
              <input
                type="number"
                value={form.acquisitionCost}
                onChange={(e) =>
                  setForm((f) => ({ ...f, acquisitionCost: Number(e.target.value) }))
                }
                className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">% participación</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.ownershipPct}
                onChange={(e) => setForm((f) => ({ ...f, ownershipPct: Number(e.target.value) }))}
                className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !form.name || !form.acquisitionCost}
              className="text-xs bg-accent text-white px-4 py-1.5 rounded hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Crear"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-text-secondary px-3 py-1.5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Portfolio table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-page border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">
                Inversión
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-text-secondary">Tipo</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">PGC</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-text-secondary">
                Coste
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-text-secondary">
                Valor actual
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium text-text-secondary">%</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-text-secondary">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {investments.map((inv) => {
              const isExp = expanded.has(inv.id);
              const gl = (inv.currentValue ?? inv.acquisitionCost) - inv.acquisitionCost;
              return (
                <>
                  <tr
                    key={inv.id}
                    className="border-b border-border hover:bg-hover cursor-pointer row-hover"
                    onClick={() => toggleExpand(inv.id)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Briefcase size={14} className="text-text-tertiary" />
                        <span className="font-medium">{inv.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded ${TYPE_COLORS[inv.type] ?? "bg-hover"}`}
                      >
                        {t(INVESTMENT_TYPE, inv.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{inv.pgcAccount}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmt(inv.acquisitionCost)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmt(inv.currentValue ?? inv.acquisitionCost)}
                      {gl !== 0 && (
                        <span
                          className={`ml-1 text-[10px] ${gl > 0 ? "text-green-600" : "text-red-500"}`}
                        >
                          ({gl > 0 ? "+" : ""}
                          {((gl / inv.acquisitionCost) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {inv.ownershipPct != null ? `${inv.ownershipPct}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${inv.status === "ACTIVE" ? "bg-green-50 text-green-600" : "bg-hover text-gray-500"}`}
                      >
                        {inv.status === "ACTIVE"
                          ? "Activa"
                          : inv.status === "FULLY_DIVESTED"
                            ? "Desinvertida"
                            : "Parcial"}
                      </span>
                    </td>
                  </tr>
                  {isExp && inv.transactions.length > 0 && (
                    <tr key={`${inv.id}_txs`}>
                      <td colSpan={7} className="bg-page px-8 py-2">
                        <p className="text-[10px] text-text-tertiary uppercase mb-1">
                          Historial de transacciones
                        </p>
                        {inv.transactions.map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center text-xs py-1 border-b border-border-light last:border-0"
                          >
                            <span className="w-16 text-text-tertiary">{fmtDate(tx.date)}</span>
                            <span className="w-32 text-text-secondary">
                              {t(INVESTMENT_TX_TYPE, tx.type)}
                            </span>
                            <span className="font-mono text-text-primary">{fmt(tx.amount)} €</span>
                            <span className="ml-auto font-mono text-[10px] text-text-tertiary">
                              D: {tx.pgcDebitAccount} / H: {tx.pgcCreditAccount}
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                  {isExp && inv.transactions.length === 0 && (
                    <tr key={`${inv.id}_empty`}>
                      <td colSpan={7} className="bg-page px-8 py-3 text-xs text-text-tertiary">
                        Sin transacciones registradas
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {investments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">
                  <Briefcase size={24} className="mx-auto mb-2 opacity-30" />
                  <p>No hay inversiones registradas</p>
                  <p className="text-xs mt-1">
                    Las inversiones se crean desde la bandeja de conciliación o manualmente
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
