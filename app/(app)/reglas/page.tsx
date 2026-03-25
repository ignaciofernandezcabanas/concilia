"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { Sparkles, Pause, Play, Trash2 } from "lucide-react";

// ── Types ──

interface Rule {
  id: string;
  name: string | null;
  type: string;
  origin: string;
  status: string;
  priority: number;
  isActive: boolean;
  timesApplied: number;
  lastExecutedAt: string | null;
  pattern: string | null;
  counterpartIban: string | null;
  counterpartName: string | null;
  conceptContains: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  transactionDirection: string | null;
  action: string;
  accountCode: string | null;
  cashflowType: string | null;
}

interface Pattern {
  id: string;
  type: string;
  status: string;
  counterpartIban: string | null;
  counterpartName: string | null;
  conceptPattern: string | null;
  predictedAction: string;
  predictedReason: string | null;
  occurrences: number;
  confidence: number;
  isActive: boolean;
  supervisedApplyCount: number;
}

interface LearningData {
  rules: Rule[];
  patterns: Pattern[];
  stats: {
    totalDecisions: number;
    acceptedUnchanged: number;
    modified: number;
    acceptanceRate: number | null;
  };
}

type Tab = "rules" | "patterns";

export default function ReglasPage() {
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Reglas" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Reglas de conciliación</h1>
        </div>

        <div className="flex items-center gap-1 border-b border-subtle">
          <button
            onClick={() => setTab("rules")}
            className={`px-4 pb-2 text-[13px] font-medium border-b-2 ${tab === "rules" ? "border-accent text-accent" : "border-transparent text-text-secondary"}`}
          >
            Mis reglas
          </button>
          <button
            onClick={() => setTab("patterns")}
            className={`px-4 pb-2 text-[13px] font-medium border-b-2 ${tab === "patterns" ? "border-accent text-accent" : "border-transparent text-text-secondary"}`}
          >
            Sugerencias del sistema
          </button>
        </div>

        {tab === "rules" && <RulesTab />}
        {tab === "patterns" && <PatternsTab />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Rules Tab
// ══════════════════════════════════════════════════════════════

function RulesTab() {
  const { data, loading, refetch } = useFetch<LearningData>("/api/settings/learning");
  const [showCreate, setShowCreate] = useState(false);

  const rules = data?.rules ?? [];

  async function toggleStatus(rule: Rule) {
    const action = rule.status === "ACTIVE" ? "deactivate" : "activate";
    await api.post("/api/settings/learning", { action, type: "rule", id: rule.id });
    refetch();
  }

  async function archiveRule(id: string) {
    if (!confirm("¿Archivar esta regla?")) return;
    await api.post("/api/settings/learning", { action: "delete", type: "rule", id });
    refetch();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col gap-4">
      {/* NL Rule Creator */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 self-start bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark"
        >
          <Sparkles size={14} />
          Nueva regla
        </button>
      ) : (
        <NLRuleCreator
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Rules table */}
      {rules.length === 0 ? (
        <div className="bg-white rounded-lg border border-subtle p-8 text-center">
          <p className="text-[13px] text-text-primary font-medium">Sin reglas</p>
          <p className="text-[11px] text-text-tertiary mt-1">
            Crea tu primera regla con lenguaje natural o resuelve conciliaciones marcando
            &quot;recordar&quot;.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-subtle overflow-hidden">
          <div className="flex items-center h-9 px-4 border-b border-subtle text-[11px] font-semibold text-text-secondary">
            <span className="w-[200px]">Nombre / Patrón</span>
            <span className="w-24">Tipo</span>
            <span className="w-20">Origen</span>
            <span className="flex-1">Acción</span>
            <span className="w-14 text-right">Usos</span>
            <span className="w-16 text-center">Estado</span>
            <span className="w-20" />
          </div>
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center h-10 px-4 text-[12px] border-b border-border-light ${rule.status !== "ACTIVE" ? "opacity-50" : ""}`}
            >
              <span className="w-[200px] text-text-primary truncate font-medium">
                {rule.name ||
                  rule.pattern ||
                  rule.counterpartIban ||
                  rule.conceptContains ||
                  rule.type}
              </span>
              <span className="w-24 text-text-secondary">
                {rule.type.replace(/_/g, " ").toLowerCase()}
              </span>
              <span className="w-20">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    rule.origin === "MANUAL"
                      ? "bg-accent-light text-accent"
                      : rule.origin === "INLINE"
                        ? "bg-amber-light text-amber-text"
                        : "bg-purple-light text-purple"
                  }`}
                >
                  {rule.origin}
                </span>
              </span>
              <span className="flex-1 text-text-secondary truncate">
                {rule.action}
                {rule.accountCode ? ` → ${rule.accountCode}` : ""}
              </span>
              <span className="w-14 text-right font-mono text-text-primary">
                {rule.timesApplied}
              </span>
              <span className="w-16 text-center">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    rule.status === "ACTIVE"
                      ? "bg-green-light text-green-text"
                      : rule.status === "PAUSED"
                        ? "bg-amber-light text-amber-text"
                        : "bg-hover text-text-tertiary"
                  }`}
                >
                  {rule.status}
                </span>
              </span>
              <span className="w-20 flex justify-end gap-1">
                <button
                  onClick={() => toggleStatus(rule)}
                  className="p-1 text-text-tertiary hover:text-text-primary"
                  title={rule.status === "ACTIVE" ? "Pausar" : "Activar"}
                >
                  {rule.status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button
                  onClick={() => archiveRule(rule.id)}
                  className="p-1 text-text-tertiary hover:text-red"
                  title="Archivar"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// NL Rule Creator
// ══════════════════════════════════════════════════════════════

function NLRuleCreator({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [reasoning, setReasoning] = useState<Record<string, string> | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    setError("");
    setProposal(null);
    setReasoning(null);
    try {
      const res = await api.post<{
        proposal: Record<string, unknown>;
        assumptions: string[];
        suggestions: string[];
        reasoning: Record<string, string> | null;
      }>("/api/settings/rules/parse", { text });
      setProposal(res.proposal);
      setAssumptions(res.assumptions ?? []);
      setSuggestions(res.suggestions ?? []);
      setReasoning(res.reasoning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!proposal) return;
    setConfirming(true);
    try {
      await api.post("/api/settings/rules/confirm", proposal);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-subtle p-5">
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !parsing && handleParse()}
          placeholder='Ej: "Los cobros de Mercadona con un 2% menos son descuento por pronto pago"'
          className="flex-1 h-10 px-4 text-[13px] border border-subtle rounded-lg placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          disabled={parsing}
        />
        <button
          onClick={handleParse}
          disabled={parsing || !text.trim()}
          className="h-10 px-5 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          <Sparkles size={14} />
          {parsing ? "Interpretando..." : "Interpretar"}
        </button>
        <button
          onClick={onCancel}
          className="h-10 px-3 text-[13px] text-text-secondary border border-subtle rounded-lg hover:bg-hover"
        >
          Cancelar
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded mb-3">{error}</p>
      )}

      {proposal && (
        <div className="border border-accent rounded-lg p-4 bg-accent-light/10">
          {proposal.humanReadable ? (
            <p className="text-[13px] text-text-primary font-medium mb-3">
              {String(proposal.humanReadable)}
            </p>
          ) : null}

          {/* Structured conditions */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] mb-3">
            {renderFields(proposal.conditions as Record<string, unknown>)}
            {renderFields(proposal.actionDetails as Record<string, unknown>)}
            {proposal.action ? (
              <div>
                <span className="text-text-tertiary">Acción:</span>{" "}
                <span className="text-text-primary">{String(proposal.action)}</span>
              </div>
            ) : null}
          </div>

          {/* Reasoning from CoT */}
          {reasoning && (
            <details className="mb-3">
              <summary className="text-[11px] text-accent cursor-pointer font-medium">
                Ver razonamiento del sistema
              </summary>
              <div className="mt-2 p-3 bg-page rounded text-[11px] text-text-secondary space-y-1">
                {Object.entries(reasoning).map(([key, val]) => (
                  <p key={key}>
                    <span className="font-medium text-text-primary">{key}:</span> {val}
                  </p>
                ))}
              </div>
            </details>
          )}

          {/* Assumptions */}
          {assumptions.length > 0 && (
            <div className="bg-amber-light rounded p-2.5 mb-2 text-[11px] text-amber-text">
              <span className="font-semibold">Asumido: </span>
              {assumptions.join(" · ")}
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-accent-light rounded p-2.5 mb-2 text-[11px] text-accent">
              <span className="font-semibold">Sugerencia: </span>
              {suggestions.join(" · ")}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="h-9 px-4 bg-green text-white text-[13px] font-medium rounded-md disabled:opacity-50"
            >
              {confirming ? "Creando..." : "Confirmar y activar"}
            </button>
            <button
              onClick={() => setProposal(null)}
              className="h-9 px-4 text-[13px] text-text-secondary border border-subtle rounded-md hover:bg-hover"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderFields(obj: Record<string, unknown> | undefined) {
  if (!obj) return null;
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => (
      <div key={k}>
        <span className="text-text-tertiary">{k}:</span>{" "}
        <span className="text-text-primary">
          {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </span>
      </div>
    ));
}

// ══════════════════════════════════════════════════════════════
// Patterns Tab
// ══════════════════════════════════════════════════════════════

function PatternsTab() {
  const { data, loading, refetch } = useFetch<LearningData>("/api/settings/learning");
  const [statusFilter, setStatusFilter] = useState("SUGGESTED");

  const patterns = (data?.patterns ?? []).filter((p) =>
    statusFilter === "all" ? true : p.status === statusFilter
  );

  async function reviewPattern(id: string, action: "approve" | "reject" | "promote") {
    await api.post(`/api/settings/learning/${id}/review`, { action });
    refetch();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter */}
      <div className="flex gap-2">
        {[
          { value: "SUGGESTED", label: "Pendientes" },
          { value: "ACTIVE_SUPERVISED", label: "Aprobados" },
          { value: "PROMOTED", label: "Promovidos" },
          { value: "REJECTED", label: "Rechazados" },
          { value: "all", label: "Todos" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md border ${
              statusFilter === f.value
                ? "bg-accent text-white border-accent"
                : "bg-white text-text-secondary border-subtle hover:bg-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {patterns.length === 0 ? (
        <div className="bg-white rounded-lg border border-subtle p-8 text-center">
          <p className="text-[13px] text-text-primary font-medium">
            Sin patrones {statusFilter !== "all" ? statusFilter.toLowerCase() : ""}
          </p>
          <p className="text-[11px] text-text-tertiary mt-1">
            Los patrones se detectan conforme resuelves conciliaciones.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-subtle overflow-hidden">
          <div className="flex items-center h-9 px-4 border-b border-subtle text-[11px] font-semibold text-text-secondary">
            <span className="w-28">Tipo</span>
            <span className="flex-1">Contrapartida / Patrón</span>
            <span className="w-32">Predicción</span>
            <span className="w-14 text-right">Veces</span>
            <span className="w-20 text-right">Confianza</span>
            <span className="w-16 text-center">Estado</span>
            <span className="w-28" />
          </div>
          {patterns.map((p) => (
            <div
              key={p.id}
              className="flex items-center h-10 px-4 text-[12px] border-b border-border-light"
            >
              <span className="w-28 text-text-secondary">{p.type}</span>
              <span className="flex-1 text-text-primary truncate">
                {p.counterpartName || p.counterpartIban || p.conceptPattern || "—"}
              </span>
              <span className="w-32 text-text-secondary truncate">
                {p.predictedReason || p.predictedAction}
              </span>
              <span className="w-14 text-right font-mono">{p.occurrences}</span>
              <span
                className={`w-20 text-right font-mono ${p.confidence >= 0.8 ? "text-green-text" : p.confidence >= 0.5 ? "text-amber-text" : "text-red-text"}`}
              >
                {(p.confidence * 100).toFixed(0)}%
              </span>
              <span className="w-16 text-center">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    p.status === "SUGGESTED"
                      ? "bg-amber-light text-amber-text"
                      : p.status === "ACTIVE_SUPERVISED"
                        ? "bg-green-light text-green-text"
                        : p.status === "PROMOTED"
                          ? "bg-purple-light text-purple"
                          : "bg-hover text-text-tertiary"
                  }`}
                >
                  {p.status.replace("_", " ")}
                </span>
              </span>
              <span className="w-28 flex justify-end gap-1">
                {p.status === "SUGGESTED" && (
                  <>
                    <button
                      onClick={() => reviewPattern(p.id, "approve")}
                      className="text-[10px] text-green-text hover:underline"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => reviewPattern(p.id, "reject")}
                      className="text-[10px] text-red-text hover:underline"
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {p.status === "ACTIVE_SUPERVISED" && (
                  <>
                    <button
                      onClick={() => reviewPattern(p.id, "promote")}
                      className="text-[10px] text-accent hover:underline"
                    >
                      Promover
                    </button>
                    <button
                      onClick={() => reviewPattern(p.id, "reject")}
                      className="text-[10px] text-red-text hover:underline"
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {p.status === "REJECTED" && (
                  <button
                    onClick={() => reviewPattern(p.id, "approve")}
                    className="text-[10px] text-accent hover:underline"
                  >
                    Reactivar
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
