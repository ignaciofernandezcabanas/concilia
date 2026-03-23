"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { useFetch } from "@/hooks/useApi";
import { api, qs } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";
import { Package, Plus, X } from "lucide-react";

interface FixedAsset {
  id: string;
  name: string;
  description: string | null;
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthlyDepreciation: number;
  status: string;
  assetAccount: { code: string; name: string };
  depreciationAccount: { code: string; name: string };
  accumDepAccount: { code: string; name: string };
}

interface AssetsResponse {
  data: FixedAsset[];
  summary: { activeCount: number; totalCost: number; totalDepreciation: number; totalNetBookValue: number };
  pagination: { total: number };
}

export default function ActivosPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data, loading, refetch } = useFetch<AssetsResponse>("/api/fixed-assets");

  const assets = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Inmovilizado" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Activos fijos</h1>
          <button onClick={() => setShowCreate(true)} className="h-8 px-3 bg-accent text-white text-[12px] font-medium rounded-md hover:bg-accent-dark flex items-center gap-1.5">
            <Plus size={14} /> Alta de activo
          </button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="Activos" value={String(summary.activeCount)} />
            <SummaryCard label="Coste total" value={formatAmount(summary.totalCost)} />
            <SummaryCard label="Amort. acumulada" value={formatAmount(summary.totalDepreciation)} />
            <SummaryCard label="Valor neto contable" value={formatAmount(summary.totalNetBookValue)} accent />
          </div>
        )}

        {loading ? <LoadingSpinner /> : assets.length === 0 ? (
          <EmptyState icon={Package} title="Sin activos" description="Registra tu primer activo fijo." />
        ) : (
          <div className="bg-white rounded-lg border border-subtle overflow-hidden">
            <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
              <span className="flex-1">Nombre</span>
              <span className="w-24">Fecha alta</span>
              <span className="w-24 text-right">Coste</span>
              <span className="w-20 text-center">Vida útil</span>
              <span className="w-32">Amortización</span>
              <span className="w-24 text-right">VNC</span>
              <span className="w-24">Estado</span>
            </div>
            {assets.map((asset) => {
              const pct = asset.acquisitionCost > 0
                ? Math.round((asset.accumulatedDepreciation / (asset.acquisitionCost - asset.residualValue)) * 100)
                : 0;
              return (
                <div key={asset.id} className="flex items-center h-12 px-5 border-b border-border-light text-[13px] hover:bg-page transition-colors">
                  <div className="flex-1">
                    <span className="text-text-primary font-medium">{asset.name}</span>
                    <span className="text-[11px] text-text-tertiary ml-2">{asset.assetAccount.code}</span>
                  </div>
                  <span className="w-24 text-text-secondary">{new Date(asset.acquisitionDate).toLocaleDateString("es-ES")}</span>
                  <span className="w-24 text-right font-mono">{formatAmount(asset.acquisitionCost)}</span>
                  <span className="w-20 text-center text-text-secondary">{Math.round(asset.usefulLifeMonths / 12)}a</span>
                  <div className="w-32 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-subtle rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? "bg-text-tertiary" : pct >= 75 ? "bg-amber" : "bg-accent"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-tertiary w-8">{pct}%</span>
                  </div>
                  <span className="w-24 text-right font-mono font-semibold">{formatAmount(asset.netBookValue)}</span>
                  <span className="w-24"><Badge value={asset.status} /></span>
                </div>
              );
            })}
          </div>
        )}

        {showCreate && <CreateAssetModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-subtle p-4">
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <p className={`text-[18px] font-semibold font-mono ${accent ? "text-accent" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}

function CreateAssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "", description: "", acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionCost: "", residualValue: "0", usefulLifeMonths: "60",
    assetAccountCode: "213", depreciationAccountCode: "681", accumDepAccountCode: "281",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      await api.post("/api/fixed-assets", {
        ...form,
        acquisitionCost: parseFloat(form.acquisitionCost) || 0,
        residualValue: parseFloat(form.residualValue) || 0,
        usefulLifeMonths: parseInt(form.usefulLifeMonths) || 60,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl border border-subtle shadow-lg w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold">Alta de activo</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Nombre" value={form.name} onChange={(v) => update("name", v)} placeholder="Maquinaria CNC" />
          <Field label="Descripción" value={form.description} onChange={(v) => update("description", v)} placeholder="Opcional" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha alta" value={form.acquisitionDate} onChange={(v) => update("acquisitionDate", v)} type="date" />
            <Field label="Coste adquisición" value={form.acquisitionCost} onChange={(v) => update("acquisitionCost", v)} placeholder="10000" type="number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor residual" value={form.residualValue} onChange={(v) => update("residualValue", v)} type="number" />
            <Field label="Vida útil (meses)" value={form.usefulLifeMonths} onChange={(v) => update("usefulLifeMonths", v)} type="number" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cuenta activo" value={form.assetAccountCode} onChange={(v) => update("assetAccountCode", v)} placeholder="213" />
            <Field label="Cuenta amort." value={form.depreciationAccountCode} onChange={(v) => update("depreciationAccountCode", v)} placeholder="681" />
            <Field label="Cuenta acum." value={form.accumDepAccountCode} onChange={(v) => update("accumDepAccountCode", v)} placeholder="281" />
          </div>
        </div>
        {error && <p className="text-[11px] text-red-text mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-4 text-[13px] border border-subtle rounded-md text-text-secondary hover:bg-hover">Cancelar</button>
          <button onClick={handleCreate} disabled={!form.name || !form.acquisitionCost || saving} className="h-9 px-4 text-[13px] bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50">
            {saving ? "Creando..." : "Dar de alta"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-secondary block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md focus:border-accent focus:outline-none" />
    </div>
  );
}
