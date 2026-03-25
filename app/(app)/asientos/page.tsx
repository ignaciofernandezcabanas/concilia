"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { useFetch } from "@/hooks/useApi";
import { api, qs } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";
import { JOURNAL_ENTRY_STATUS, t } from "@/lib/i18n/enums";
import { BookOpen, Plus, Bot, ChevronDown, ChevronRight, Check, X } from "lucide-react";

interface JournalLine {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  account: { code: string; name: string };
}

interface JournalEntry {
  id: string;
  number: number;
  date: string;
  description: string;
  type: string;
  status: string;
  lines: JournalLine[];
}

export default function AsientosPage() {
  const [status, setStatus] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data, loading, refetch } = useFetch<{
    data: JournalEntry[];
    pagination: { total: number };
  }>(`/api/journal-entries${qs({ status: status || undefined, limit: 50 })}`);

  const entries = data?.data ?? [];

  async function handlePost(id: string) {
    await api.post(`/api/journal-entries/${id}`, { action: "post" });
    refetch();
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Asientos contables" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-text-primary">Asientos</h1>
            <span className="text-[12px] text-text-tertiary">
              {data?.pagination.total ?? 0} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 px-3 text-[12px] border border-subtle rounded-md"
            >
              <option value="">Todos</option>
              <option value="DRAFT">{t(JOURNAL_ENTRY_STATUS, "DRAFT")}</option>
              <option value="POSTED">{t(JOURNAL_ENTRY_STATUS, "POSTED")}</option>
              <option value="REVERSED">{t(JOURNAL_ENTRY_STATUS, "REVERSED")}</option>
            </select>
            <button
              onClick={() => setShowCreate(true)}
              className="h-8 px-3 bg-accent text-white text-[12px] font-medium rounded-md hover:bg-accent-dark flex items-center gap-1.5"
            >
              <Plus size={14} /> Nuevo asiento
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Sin asientos"
            description="Crea un asiento manual o espera a que el agente AI genere propuestas."
          />
        ) : (
          <div className="bg-white rounded-lg border border-subtle overflow-hidden">
            {/* Header */}
            <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
              <span className="w-6" />
              <span className="w-16">Nº</span>
              <span className="w-24">Fecha</span>
              <span className="flex-1">Descripción</span>
              <span className="w-28">Tipo</span>
              <span className="w-24">Estado</span>
              <span className="w-24 text-right font-mono">Debe</span>
              <span className="w-24 text-right font-mono">Haber</span>
              <span className="w-20" />
            </div>

            {entries.map((entry) => {
              const expanded = expandedId === entry.id;
              const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
              const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
              const isAI =
                entry.type === "AUTO_DEPRECIATION" || entry.type === "AUTO_RECONCILIATION";

              return (
                <div key={entry.id}>
                  <div
                    className={`flex items-center h-11 px-5 text-[13px] border-b border-border-light hover:bg-page transition-colors cursor-pointer ${
                      isAI && entry.status === "DRAFT" ? "bg-accent-light/10" : ""
                    }`}
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                  >
                    <span className="w-6 text-text-tertiary">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="w-16 font-mono text-text-secondary">#{entry.number}</span>
                    <span className="w-24 text-text-secondary">
                      {new Date(entry.date).toLocaleDateString("es-ES")}
                    </span>
                    <span className="flex-1 text-text-primary truncate flex items-center gap-1.5">
                      {isAI && <Bot size={12} className="text-accent shrink-0" />}
                      {entry.description}
                    </span>
                    <span className="w-28">
                      <Badge value={entry.type} />
                    </span>
                    <span className="w-24">
                      <Badge value={entry.status} />
                    </span>
                    <span className="w-24 text-right font-mono">{formatAmount(totalDebit)}</span>
                    <span className="w-24 text-right font-mono">{formatAmount(totalCredit)}</span>
                    <span className="w-20 flex justify-end gap-1">
                      {entry.status === "DRAFT" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePost(entry.id);
                          }}
                          className="p-1 rounded hover:bg-green-light text-green"
                          title="Contabilizar"
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </span>
                  </div>

                  {/* Expanded lines */}
                  {expanded && (
                    <div className="bg-page border-b border-subtle">
                      {entry.lines.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-center h-9 px-5 pl-14 text-[12px] border-b border-border-light last:border-0"
                        >
                          <span className="w-20 font-mono text-accent">{line.account.code}</span>
                          <span className="flex-1 text-text-secondary">
                            {line.account.name}
                            {line.description ? ` — ${line.description}` : ""}
                          </span>
                          <span className="w-24 text-right font-mono">
                            {line.debit > 0 ? formatAmount(line.debit) : ""}
                          </span>
                          <span className="w-24 text-right font-mono">
                            {line.credit > 0 ? formatAmount(line.credit) : ""}
                          </span>
                          <span className="w-20" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <CreateEntryModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              refetch();
            }}
          />
        )}
      </div>
    </div>
  );
}

function CreateEntryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([
    { accountCode: "", debit: "", credit: "", description: "" },
    { accountCode: "", debit: "", credit: "", description: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addLine() {
    setLines((prev) => [...prev, { accountCode: "", debit: "", credit: "", description: "" }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  function updateLine(i: number, field: string, value: string) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, [field]: value } : l)));
  }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      await api.post("/api/journal-entries", {
        date,
        description,
        lines: lines
          .filter((l) => l.accountCode && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
          .map((l) => ({
            accountCode: l.accountCode,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            description: l.description || undefined,
          })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-subtle shadow-lg w-full max-w-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold text-text-primary">Nuevo asiento</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="text-[11px] font-medium text-text-secondary block mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
            />
          </div>
          <div className="flex-[2]">
            <label className="text-[11px] font-medium text-text-secondary block mb-1">
              Descripción
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Concepto del asiento"
              className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
            />
          </div>
        </div>

        {/* Lines */}
        <div className="border border-subtle rounded-lg overflow-hidden mb-3">
          <div className="flex items-center h-8 px-3 bg-page text-[11px] font-semibold text-text-tertiary">
            <span className="w-20">Cuenta</span>
            <span className="flex-1">Descripción</span>
            <span className="w-24 text-right">Debe</span>
            <span className="w-24 text-right">Haber</span>
            <span className="w-8" />
          </div>
          {lines.map((line, i) => (
            <div key={i} className="flex items-center h-9 px-3 border-t border-border-light gap-1">
              <input
                type="text"
                value={line.accountCode}
                onChange={(e) => updateLine(i, "accountCode", e.target.value)}
                placeholder="629"
                className="w-20 h-7 px-2 text-[12px] font-mono border border-subtle rounded"
              />
              <input
                type="text"
                value={line.description}
                onChange={(e) => updateLine(i, "description", e.target.value)}
                placeholder="Concepto línea"
                className="flex-1 h-7 px-2 text-[12px] border border-subtle rounded"
              />
              <input
                type="number"
                value={line.debit}
                onChange={(e) => updateLine(i, "debit", e.target.value)}
                placeholder="0.00"
                className="w-24 h-7 px-2 text-[12px] font-mono border border-subtle rounded text-right"
              />
              <input
                type="number"
                value={line.credit}
                onChange={(e) => updateLine(i, "credit", e.target.value)}
                placeholder="0.00"
                className="w-24 h-7 px-2 text-[12px] font-mono border border-subtle rounded text-right"
              />
              <button
                onClick={() => removeLine(i)}
                className="w-8 flex justify-center text-text-tertiary hover:text-red"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="flex items-center h-9 px-3 border-t border-subtle bg-page">
            <button
              onClick={addLine}
              className="text-[11px] text-accent font-medium flex items-center gap-1"
            >
              <Plus size={12} /> Línea
            </button>
            <span className="flex-1" />
            <span
              className={`w-24 text-right text-[12px] font-mono font-semibold ${balanced ? "text-green-text" : "text-red-text"}`}
            >
              {totalDebit.toFixed(2)}
            </span>
            <span
              className={`w-24 text-right text-[12px] font-mono font-semibold ${balanced ? "text-green-text" : "text-red-text"}`}
            >
              {totalCredit.toFixed(2)}
            </span>
            <span className="w-8" />
          </div>
        </div>

        {!balanced && totalDebit > 0 && (
          <p className="text-[11px] text-red-text mb-3">
            El asiento no cuadra: Debe ({totalDebit.toFixed(2)}) ≠ Haber ({totalCredit.toFixed(2)})
          </p>
        )}

        {error && (
          <p className="text-[11px] text-red-text bg-red-light px-3 py-2 rounded mb-3">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-[13px] border border-subtle rounded-md text-text-secondary hover:bg-hover"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!balanced || !description || saving}
            className="h-9 px-4 text-[13px] bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? "Creando..." : "Crear borrador"}
          </button>
        </div>
      </div>
    </div>
  );
}
