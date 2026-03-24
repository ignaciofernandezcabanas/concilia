"use client";

import { useState, useRef } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { useTransactions } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import { Download, Upload, Landmark, X, FileSpreadsheet, Trash2 } from "lucide-react";

export default function Movimientos() {
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(
      selected.size === transactions.length ? new Set() : new Set(transactions.map((t) => t.id))
    );
  }
  async function handleDelete(ids: string[]) {
    if (!confirm(`¿Eliminar ${ids.length} movimiento${ids.length > 1 ? "s" : ""}?`)) return;
    setDeleting(true);
    try {
      let res;
      if (ids.length === 1) {
        res = await api.delete(`/api/transactions/${ids[0]}`);
      } else {
        res = await api.post("/api/transactions/batch-delete", { ids });
      }
      console.log("Delete result:", res);
      setSelected(new Set());
      refetch();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(err instanceof Error ? err.message : "Error al eliminar. Revisa la consola.");
    } finally {
      setDeleting(false);
    }
  }

  const { data, loading, refetch } = useTransactions({
    status: status || undefined,
    search: search || undefined,
    page,
    pageSize: 25,
  });

  const transactions = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Movimientos" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Movimientos</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark transition-colors"
            >
              <Upload size={16} />
              Importar CSV
            </button>
            <button className="flex items-center gap-2 text-[13px] font-medium px-4 h-9 rounded-md border border-subtle text-text-primary hover:bg-hover transition-colors">
              <Download size={16} />
              Exportar
            </button>
          </div>
        </div>

        {/* Import modal */}
        {showImport && (
          <CsvImportModal
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              setShowImport(false);
              setPage(1);
              refetch();
            }}
          />
        )}

        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 px-3 text-[13px] bg-white border border-subtle rounded-md text-text-secondary"
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="RECONCILED">Conciliado</option>
            <option value="CLASSIFIED">Clasificado</option>
            <option value="INVESTIGATING">Investigar</option>
            <option value="INTERNAL">Interno</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar concepto, contrapartida..."
            className="h-8 px-3 text-[13px] bg-white border border-subtle rounded-md w-64 placeholder:text-text-tertiary"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-text-tertiary">{total} movimientos</p>
          {selected.size > 0 && (
            <button
              onClick={() => handleDelete(Array.from(selected))}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 h-8 bg-red text-white text-[13px] font-medium rounded-md hover:bg-red-text transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              Eliminar {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
            </button>
          )}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Sin movimientos"
            description="Importa un CSV de tu banco para empezar."
          />
        ) : (
          <>
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                <span className="w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === transactions.length && transactions.length > 0}
                    onChange={toggleAll}
                    className="rounded border-subtle cursor-pointer"
                  />
                </span>
                <span className="w-24">Fecha</span>
                <span className="flex-1">Concepto</span>
                <span className="w-[160px]">Contrapartida</span>
                <span className="w-[110px] text-right">Importe</span>
                <span className="w-24 text-center">Estado</span>
                <span className="w-12 text-center"></span>
              </div>
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`flex items-center h-12 px-5 text-[13px] border-b border-border-light hover:bg-page transition-colors ${selected.has(tx.id) ? "bg-accent-light/30" : ""}`}
                >
                  <span className="w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(tx.id)}
                      onChange={() => toggleSelect(tx.id)}
                      className="rounded border-subtle cursor-pointer"
                    />
                  </span>
                  <span className="w-24 text-text-secondary">{formatDate(tx.valueDate)}</span>
                  <span className="flex-1 text-text-primary truncate">
                    {tx.conceptParsed || tx.concept || "—"}
                  </span>
                  <span className="w-[160px] text-text-secondary truncate">
                    {tx.counterpartName || tx.counterpartIban || "—"}
                  </span>
                  <span
                    className={`w-[110px] text-right font-mono font-medium ${tx.amount >= 0 ? "text-green-text" : "text-red-text"}`}
                  >
                    {formatAmount(tx.amount)}
                  </span>
                  <span className="w-24 flex justify-center">
                    <Badge value={tx.status} />
                  </span>
                  <span className="w-12 flex justify-center">
                    <button
                      onClick={() => handleDelete([tx.id])}
                      className="p-1 rounded hover:bg-red-light text-text-tertiary hover:text-red"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 h-8 text-[13px] border border-subtle rounded-md disabled:opacity-30 hover:bg-hover"
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 h-8 text-[13px] border border-subtle rounded-md disabled:opacity-30 hover:bg-hover"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CSV Import Modal
// ══════════════════════════════════════════════════════════════

function CsvImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    created: number;
    skipped: number;
    total: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // We need to use fetch directly because api.post sends JSON
      const token = await getToken();
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al importar");
        return;
      }

      setResult(data);
      if (data.created > 0) {
        setTimeout(onSuccess, 1000);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".txt"))) {
      setFile(f);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg border border-subtle w-full max-w-lg shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Processing overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3 rounded-lg">
            <div className="w-8 h-8 border-3 border-subtle border-t-accent rounded-full animate-spin" />
            <span className="text-[14px] font-semibold text-text-primary">
              Importando movimientos...
            </span>
            <span className="text-[12px] text-text-secondary">Procesando el archivo CSV</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-subtle">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Importar movimientos bancarios
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-text-tertiary hover:text-text-primary disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-subtle rounded-lg p-8 text-center cursor-pointer hover:border-accent hover:bg-accent-light/20 transition-colors"
          >
            <FileSpreadsheet size={32} className="text-text-tertiary mx-auto mb-2" />
            {file ? (
              <p className="text-[13px] text-text-primary font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-[13px] text-text-primary">
                  Arrastra tu CSV aquí o haz click para seleccionar
                </p>
                <p className="text-[11px] text-text-tertiary mt-1">
                  Soporta formatos de la mayoría de bancos españoles
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>

          {/* Format info */}
          <div className="bg-page rounded-md p-3 text-[11px] text-text-secondary">
            <p className="font-medium text-text-primary mb-1">
              Columnas detectadas automáticamente:
            </p>
            <p>Fecha, Concepto/Descripción, Importe, Saldo, Referencia, Beneficiario</p>
            <p className="mt-1">
              Separador: <code className="bg-hover px-1 rounded">;</code>{" "}
              <code className="bg-hover px-1 rounded">,</code> o{" "}
              <code className="bg-hover px-1 rounded">tab</code> (auto-detectado)
            </p>
            <p>Formatos de fecha: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY</p>
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">{error}</p>}

          {/* Result */}
          {result && (
            <div
              className={`text-xs px-3 py-2 rounded ${result.created > 0 ? "bg-green-light text-green-text" : "bg-amber-light text-amber-text"}`}
            >
              <p className="font-medium">
                {result.created} movimientos importados
                {result.skipped > 0 && ` · ${result.skipped} duplicados omitidos`}
              </p>
              {result.errors.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">{result.errors.length} errores</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="h-9 px-4 text-[13px] text-text-secondary border border-subtle rounded-md hover:bg-hover"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="h-9 px-4 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark disabled:opacity-50 flex items-center gap-2"
            >
              <Upload size={14} />
              {uploading ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to get auth token for FormData upload
async function getToken(): Promise<string | null> {
  const { getSupabase } = await import("@/lib/api-client");
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { session },
  } = await sb.auth.getSession();
  return session?.access_token ?? null;
}
