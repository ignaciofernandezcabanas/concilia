"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Trash2, Brain, Sparkles, MessageSquare } from "lucide-react";

// ── Types ──

interface RuleItem {
  id: string;
  type: string;
  pattern?: string;
  counterpartIban?: string;
  action: string;
  accountCode?: string;
  timesApplied: number;
  isActive: boolean;
}

interface PatternItem {
  id: string;
  type: string;
  counterpartIban?: string;
  counterpartName?: string;
  conceptPattern?: string;
  predictedAction: string;
  predictedReason?: string;
  occurrences: number;
  correctPredictions: number;
  confidence: number;
  isActive: boolean;
  status?: string;
  supervisedApplyCount?: number;
}

interface LearningData {
  patterns: PatternItem[];
  rules: RuleItem[];
  calibrations: { category: string; period: string; currentThreshold: number; suggestedThreshold?: number; autoApprovedCount: number; autoApprovedErrors: number; monthsNoError: number }[];
  stats: { totalDecisions: number; acceptedUnchanged: number; modified: number; acceptanceRate: number | null };
}

// ── Main Component ──

export default function LearningTab() {
  const { data, loading, refetch } = useFetch<LearningData>("/api/settings/learning");

  if (loading) return <LoadingSpinner />;
  if (!data) return <p className="text-[13px] text-text-tertiary">Cargando datos de aprendizaje...</p>;

  const { patterns, rules, stats } = data;

  // Merge rules + patterns into a unified list
  const allItems: {
    id: string;
    source: "rule" | "pattern";
    label: string;
    detail: string;
    occurrences: number;
    confidence: number | null;
    isActive: boolean;
  }[] = [
    ...rules.map((r) => ({
      id: r.id,
      source: "rule" as const,
      label: `${r.pattern || r.counterpartIban || r.type}`,
      detail: `${r.action}${r.accountCode ? ` → ${r.accountCode}` : ""}`,
      occurrences: r.timesApplied,
      confidence: null as number | null,
      isActive: r.isActive,
    })),
    ...patterns.map((p) => ({
      id: p.id,
      source: "pattern" as const,
      label: `${p.counterpartName || p.counterpartIban || p.conceptPattern || p.type}`,
      detail: `${p.predictedReason || p.predictedAction}`,
      occurrences: p.occurrences,
      confidence: p.confidence,
      isActive: p.isActive,
    })),
  ].sort((a, b) => b.occurrences - a.occurrences);

  async function handleDelete(source: "rule" | "pattern", id: string) {
    if (!confirm("¿Eliminar? El algoritmo aprenderá de esta eliminación.")) return;
    await api.post("/api/settings/learning", { action: "delete", type: source, id });
    refetch();
  }

  async function handlePatternReview(id: string, action: "approve" | "reject" | "promote") {
    await api.post(`/api/settings/learning/${id}/review`, { action });
    refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Decisiones totales" value={stats.totalDecisions} />
        <StatCard label="Aceptadas sin cambios" value={stats.acceptedUnchanged} />
        <StatCard label="Corregidas por controller" value={stats.modified} />
        <StatCard
          label="Tasa de aceptación"
          value={stats.acceptanceRate != null ? `${(stats.acceptanceRate * 100).toFixed(1)}%` : "—"}
          highlight={stats.acceptanceRate != null && stats.acceptanceRate >= 0.80}
          isText
        />
      </div>

      {/* NL Rule Creator */}
      <NLRuleCreator onCreated={refetch} />

      {/* Category thresholds */}
      <CategoryThresholds />

      {/* Unified rules + patterns table */}
      <div>
        <h3 className="text-[14px] font-semibold text-text-primary mb-1">Reglas y patrones aprendidos</h3>
        <p className="text-[11px] text-text-tertiary mb-3">
          Las reglas explícitas prevalecen sobre los patrones implícitos. Puedes eliminar cualquiera — el algoritmo ajustará su comportamiento.
        </p>

        {allItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-subtle p-8 text-center">
            <Brain size={28} className="text-text-tertiary mx-auto mb-2" />
            <p className="text-[13px] text-text-primary font-medium">Sin reglas ni patrones</p>
            <p className="text-[11px] text-text-tertiary mt-1">
              Se generan cuando resuelves conciliaciones o creas reglas con lenguaje natural.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-subtle overflow-hidden">
            <div className="flex items-center h-9 px-4 border-b border-subtle text-[11px] font-semibold text-text-secondary">
              <span className="w-16">Origen</span>
              <span className="flex-1">Patrón / Contrapartida</span>
              <span className="w-40">Acción</span>
              <span className="w-14 text-right">Usos</span>
              <span className="w-20 text-right">Confianza</span>
              <span className="w-16 text-center">Estado</span>
              <span className="w-24" />
            </div>
            {allItems.map((item) => (
              <div key={`${item.source}-${item.id}`} className={`flex items-center h-10 px-4 text-[12px] border-b border-border-light ${!item.isActive ? "opacity-40" : ""}`}>
                <span className="w-16">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    item.source === "rule" ? "bg-accent-light text-accent" : "bg-purple-light text-purple"
                  }`}>
                    {item.source === "rule" ? "Regla" : "Patrón"}
                  </span>
                </span>
                <span className="flex-1 text-text-primary truncate">{item.label}</span>
                <span className="w-40 text-text-secondary truncate">{item.detail}</span>
                <span className="w-14 text-right font-mono text-text-primary">{item.occurrences}</span>
                <span className={`w-20 text-right font-mono ${
                  item.confidence == null ? "text-text-tertiary" :
                  item.confidence >= 0.8 ? "text-green-text" :
                  item.confidence >= 0.5 ? "text-amber-text" : "text-red-text"
                }`}>
                  {item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : item.source === "rule" ? "100%" : "—"}
                </span>
                <span className="w-16 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.isActive ? "bg-green-light text-green-text" : "bg-hover text-text-tertiary"}`}>
                    {item.isActive ? "Activa" : "Inactiva"}
                  </span>
                </span>
                <span className="w-24 flex justify-end gap-1">
                  {/* Pattern lifecycle actions */}
                  {item.source === "pattern" && (() => {
                    const p = patterns.find((pp) => pp.id === item.id);
                    const pStatus = p?.status ?? "SUGGESTED";
                    if (pStatus === "SUGGESTED") return (
                      <>
                        <button onClick={() => handlePatternReview(item.id, "approve")} className="text-[10px] text-green-text hover:underline">Aprobar</button>
                        <button onClick={() => handlePatternReview(item.id, "reject")} className="text-[10px] text-red-text hover:underline">Rechazar</button>
                      </>
                    );
                    if (pStatus === "ACTIVE_SUPERVISED") return (
                      <button onClick={() => handlePatternReview(item.id, "promote")} className="text-[10px] text-accent hover:underline">Promover</button>
                    );
                    return null;
                  })()}
                  <button
                    onClick={() => handleDelete(item.source, item.id)}
                    className="p-1 rounded hover:bg-red-light text-text-tertiary hover:text-red transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NL Rule Creator ──

function NLRuleCreator({ onCreated }: { onCreated: () => void }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    setError("");
    setSuccess("");
    setProposal(null);
    try {
      const res = await api.post<{ proposal: Record<string, unknown>; assumptions: string[]; suggestions: string[] }>(
        "/api/settings/rules/parse",
        { text }
      );
      setProposal(res.proposal);
      setAssumptions(res.assumptions ?? []);
      setSuggestions(res.suggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al interpretar la regla");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!proposal) return;
    setConfirming(true);
    try {
      await api.post("/api/settings/rules/confirm", proposal);
      setProposal(null);
      setText("");
      setSuccess("Regla creada correctamente");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear regla");
    } finally {
      setConfirming(false);
    }
  }

  function handleCancel() {
    setProposal(null);
    setAssumptions([]);
    setSuggestions([]);
    setError("");
  }

  return (
    <div className="bg-white rounded-lg border border-subtle p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} className="text-accent" />
        <h3 className="text-[14px] font-semibold text-text-primary">Crear regla</h3>
      </div>
      <p className="text-[11px] text-text-tertiary mb-3">
        Describe la regla en lenguaje natural. El sistema la interpretará con IA y te pedirá confirmación antes de activarla.
      </p>

      {/* Input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setSuccess(""); }}
          onKeyDown={(e) => e.key === "Enter" && !parsing && handleParse()}
          placeholder='Ej: "Los cobros de Mercadona con un 2% menos son descuento por pronto pago"'
          className="flex-1 h-10 px-4 text-[13px] border border-subtle rounded-lg placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          disabled={parsing}
        />
        <button
          onClick={handleParse}
          disabled={parsing || !text.trim()}
          className="h-10 px-5 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50 shrink-0 flex items-center gap-2"
        >
          <Sparkles size={14} />
          {parsing ? "Interpretando..." : "Interpretar"}
        </button>
      </div>

      {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded mb-3">{error}</p>}
      {success && <p className="text-xs text-green-text bg-green-light px-3 py-2 rounded mb-3">{success}</p>}

      {/* Proposal card */}
      {proposal && (
        <div className="border border-accent rounded-lg p-4 bg-accent-light/20">
          <div className="text-[12px] font-semibold text-accent mb-2">Regla interpretada:</div>

          {proposal.humanReadable ? (
            <p className="text-[13px] text-text-primary font-medium mb-3">{String(proposal.humanReadable)}</p>
          ) : null}

          {/* Structured details */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] mb-3">
            <ConditionDetails conditions={proposal.conditions as Record<string, unknown>} />
            <ActionDetails action={proposal.action as string} details={proposal.actionDetails as Record<string, unknown>} />
          </div>

          {assumptions.length > 0 && (
            <div className="bg-amber-light rounded p-2.5 mb-2">
              <span className="text-[11px] font-semibold text-amber-text">Asumido: </span>
              {assumptions.map((a, i) => <span key={i} className="text-[11px] text-amber-text">{i > 0 ? " · " : ""}{a}</span>)}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="bg-accent-light rounded p-2.5 mb-2">
              <span className="text-[11px] font-semibold text-accent">Sugerencia: </span>
              {suggestions.map((s, i) => <span key={i} className="text-[11px] text-accent">{i > 0 ? " · " : ""}{s}</span>)}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button onClick={handleConfirm} disabled={confirming} className="h-8 px-4 bg-green text-white text-[12px] font-medium rounded-md disabled:opacity-50">
              {confirming ? "Creando..." : "Confirmar y activar"}
            </button>
            <button onClick={handleCancel} className="h-8 px-4 text-[12px] text-text-secondary border border-subtle rounded-md hover:bg-hover">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionDetails({ conditions }: { conditions?: Record<string, unknown> }) {
  if (!conditions) return null;
  const rows: [string, string][] = [];
  if (conditions.counterpartName) rows.push(["Contrapartida", conditions.counterpartName as string]);
  if (conditions.counterpartCif) rows.push(["CIF", conditions.counterpartCif as string]);
  if (conditions.counterpartIban) rows.push(["IBAN", conditions.counterpartIban as string]);
  if (conditions.conceptPattern) rows.push(["Concepto", conditions.conceptPattern as string]);
  if (conditions.transactionType) rows.push(["Tipo", conditions.transactionType as string]);
  if (conditions.minAmount || conditions.maxAmount) rows.push(["Importe", `${conditions.minAmount ?? "—"}€ — ${conditions.maxAmount ?? "—"}€`]);
  return <>{rows.map(([k, v]) => <div key={k}><span className="text-text-tertiary">{k}:</span> <span className="text-text-primary">{v}</span></div>)}</>;
}

function ActionDetails({ action, details }: { action?: string; details?: Record<string, unknown> }) {
  if (!action) return null;
  const rows: [string, string][] = [["Acción", action]];
  if (details?.accountCode) rows.push(["Cuenta PGC", `${details.accountCode}${details.accountName ? ` - ${details.accountName}` : ""}`]);
  if (details?.differenceReason) rows.push(["Causa diferencia", details.differenceReason as string]);
  if (details?.description) rows.push(["Nota", details.description as string]);
  return <>{rows.map(([k, v]) => <div key={k}><span className="text-text-tertiary">{k}:</span> <span className="text-text-primary">{v}</span></div>)}</>;
}

// ── Stat Card ──

// ── Category Thresholds ──

const CATEGORY_LABELS: Record<string, string> = {
  EXACT_MATCH: "Match exacto",
  GROUPED_MATCH: "Match agrupado",
  DIFFERENCE_MATCH: "Match con diferencia",
  PARTIAL_MATCH: "Match parcial",
  CLASSIFICATION: "Clasificación",
};

function CategoryThresholds() {
  const { data, loading, refetch } = useFetch<{
    global: number;
    categories: { category: string; threshold: number; isCustom: boolean }[];
  }>("/api/settings/thresholds");

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  if (loading || !data) return null;

  async function saveThreshold(category: string) {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0.5 || val > 0.99) return;
    await api.put("/api/settings/thresholds", { category, threshold: val });
    setEditing(null);
    refetch();
  }

  async function resetThreshold(category: string) {
    await api.put("/api/settings/thresholds", { category, reset: true });
    refetch();
  }

  return (
    <div>
      <h3 className="text-[14px] font-semibold text-text-primary mb-1">Umbrales por categoría</h3>
      <p className="text-[11px] text-text-tertiary mb-3">
        Umbral global: {(data.global * 100).toFixed(0)}%. Las categorías sin umbral propio usan el global.
      </p>
      <div className="bg-white rounded-lg border border-subtle overflow-hidden">
        <div className="flex items-center h-9 px-4 border-b border-subtle text-[11px] font-semibold text-text-secondary">
          <span className="flex-1">Categoría</span>
          <span className="w-24 text-right">Umbral</span>
          <span className="w-20 text-center">Custom</span>
          <span className="w-20" />
        </div>
        {data.categories.map((cat) => (
          <div key={cat.category} className="flex items-center h-10 px-4 text-[12px] border-b border-border-light">
            <span className="flex-1 text-text-primary">{CATEGORY_LABELS[cat.category] ?? cat.category}</span>
            <span className="w-24 text-right">
              {editing === cat.category ? (
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  max="0.99"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveThreshold(cat.category)}
                  onBlur={() => setEditing(null)}
                  autoFocus
                  className="w-16 h-6 px-1 text-right text-[12px] border border-accent rounded"
                />
              ) : (
                <span className="font-mono">{(cat.threshold * 100).toFixed(0)}%</span>
              )}
            </span>
            <span className="w-20 text-center">
              {cat.isCustom && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-light text-accent">Custom</span>
              )}
            </span>
            <span className="w-20 flex justify-end gap-1">
              <button
                onClick={() => { setEditing(cat.category); setEditValue(cat.threshold.toString()); }}
                className="text-[10px] text-accent hover:underline"
              >
                Editar
              </button>
              {cat.isCustom && (
                <button onClick={() => resetThreshold(cat.category)} className="text-[10px] text-text-tertiary hover:underline">
                  Reset
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight, isText }: { label: string; value: string | number; highlight?: boolean; isText?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-subtle p-4 text-center">
      <div className="text-[11px] text-text-secondary mb-1">{label}</div>
      <div className={`text-lg font-semibold ${isText ? "" : "font-mono"} ${highlight ? "text-green-text" : "text-text-primary"}`}>
        {value}
      </div>
    </div>
  );
}
