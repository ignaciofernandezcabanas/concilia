"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import { CalendarRange, Plus, Link2 } from "lucide-react";
import { formatAmount } from "@/lib/format";

interface Accrual {
  id: string;
  description: string;
  contact?: { name: string } | null;
  totalAnnualAmount: number;
  monthlyAmount: number;
  expenseAccountCode: string;
  accrualAccountCode: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  status: string;
  lastAccruedDate: string | null;
  totalAccrued: number;
  autoReverse: boolean;
  linkedInvoice?: { number: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green/10 text-green-text",
  PAUSED: "bg-amber/10 text-amber-700",
  COMPLETED: "bg-blue/10 text-blue-700",
  CANCELLED: "bg-subtle text-text-tertiary",
};

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  ANNUAL: "Anual",
};

function fmt(n: number) {
  return formatAmount(n);
}

export default function PeriodificacionesPage() {
  const { data, refetch } = useFetch<{ data: Accrual[] }>("/api/accruals");
  const accruals = data?.data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    description: "",
    totalAnnualAmount: "",
    expenseAccountCode: "",
    accrualAccountCode: "480",
    frequency: "MONTHLY",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    autoReverse: true,
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const total = parseFloat(form.totalAnnualAmount);
      if (isNaN(total) || total <= 0) return;
      await fetch("/api/accruals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          totalAnnualAmount: total,
          endDate: form.endDate || undefined,
        }),
      });
      setShowCreate(false);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Periodificaciones recurrentes</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          <Plus size={16} /> Nueva periodificación
        </button>
      </div>

      {accruals.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary">
          <CalendarRange size={48} className="mx-auto mb-4 opacity-40" />
          <p className="text-lg mb-1">Sin periodificaciones</p>
          <p className="text-sm">
            Crea periodificaciones para devengar gastos recurrentes mensualmente.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle bg-page">
                <th className="text-left px-4 py-3 font-medium text-text-secondary">Descripción</th>
                <th className="text-left px-4 py-3 font-medium text-text-secondary">Proveedor</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">Mensual</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">Anual</th>
                <th className="text-center px-4 py-3 font-medium text-text-secondary">
                  Frecuencia
                </th>
                <th className="text-center px-4 py-3 font-medium text-text-secondary">Progreso</th>
                <th className="text-center px-4 py-3 font-medium text-text-secondary">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-text-secondary">Factura</th>
              </tr>
            </thead>
            <tbody>
              {accruals.map((a) => {
                const pct =
                  a.totalAnnualAmount > 0
                    ? Math.min(100, Math.round((a.totalAccrued / a.totalAnnualAmount) * 100))
                    : 0;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-subtle last:border-0 hover:bg-hover transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{a.description}</td>
                    <td className="px-4 py-3 text-text-secondary">{a.contact?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {fmt(a.monthlyAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-secondary">
                      {fmt(a.totalAnnualAmount)}
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary">
                      {FREQ_LABELS[a.frequency] ?? a.frequency}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-1.5 bg-subtle rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-text-tertiary">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[a.status] ?? ""}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary text-xs">
                      {a.linkedInvoice ? (
                        <span className="flex items-center gap-1 justify-center text-green-text">
                          <Link2 size={12} /> {a.linkedInvoice.number}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">Nueva periodificación</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Descripción</label>
                <input
                  className="w-full border border-subtle rounded px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Seguro RC anual, Auditoría..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Importe anual (€)
                  </label>
                  <input
                    type="number"
                    className="w-full border border-subtle rounded px-3 py-2 text-sm"
                    value={form.totalAnnualAmount}
                    onChange={(e) => setForm({ ...form, totalAnnualAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Frecuencia</label>
                  <select
                    className="w-full border border-subtle rounded px-3 py-2 text-sm"
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  >
                    <option value="MONTHLY">Mensual</option>
                    <option value="QUARTERLY">Trimestral</option>
                    <option value="ANNUAL">Anual</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Cuenta gasto PGC</label>
                  <input
                    className="w-full border border-subtle rounded px-3 py-2 text-sm"
                    value={form.expenseAccountCode}
                    onChange={(e) => setForm({ ...form, expenseAccountCode: e.target.value })}
                    placeholder="625, 621..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Cuenta periodificación
                  </label>
                  <input
                    className="w-full border border-subtle rounded px-3 py-2 text-sm"
                    value={form.accrualAccountCode}
                    onChange={(e) => setForm({ ...form, accrualAccountCode: e.target.value })}
                    placeholder="480, 485..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    className="w-full border border-subtle rounded px-3 py-2 text-sm"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Fecha fin (opcional)
                  </label>
                  <input
                    type="date"
                    className="w-full border border-subtle rounded px-3 py-2 text-sm"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.autoReverse}
                  onChange={(e) => setForm({ ...form, autoReverse: e.target.checked })}
                />
                Revertir automáticamente al vincular factura
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={
                  saving || !form.description || !form.totalAnnualAmount || !form.expenseAccountCode
                }
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
