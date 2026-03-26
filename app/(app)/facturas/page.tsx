"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/Toast";
import Badge from "@/components/Badge";
import { useInvoices } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import { INVOICE_STATUS, INVOICE_TYPE, t } from "@/lib/i18n/enums";
import { Download, Upload, FileText, X, FolderOpen, Eye, Trash2 } from "lucide-react";

export default function Facturas() {
  const searchParams = useSearchParams();
  const [type, setType] = useState<string>(searchParams.get("type") ?? "");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const vatRateParam = searchParams.get("vatRate") ?? "";
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<{ id: string; number: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data, loading, refetch } = useInvoices({
    type: type || undefined,
    status: status || undefined,
    search: search || undefined,
    vatRate: vatRateParam || undefined,
    page,
    pageSize: 25,
  });

  const invoices = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;
  const aggregateTotal =
    (data as unknown as { aggregate?: { totalAmount: number } } | null)?.aggregate?.totalAmount ??
    0;
  const hasActiveFilter = !!(status || type || search);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((i) => i.id)));
    }
  }

  function requestDelete(ids: string[]) {
    setPendingDelete(ids);
  }

  async function executeDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.length === 1) {
        await api.delete(`/api/invoices/${pendingDelete[0]}`);
      } else {
        await api.post("/api/invoices/batch-delete", { ids: pendingDelete });
      }
      setSelected(new Set());
      refetch();
      setToast({
        message: `${pendingDelete.length} factura${pendingDelete.length > 1 ? "s" : ""} eliminada${pendingDelete.length > 1 ? "s" : ""}`,
        type: "success",
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Error al eliminar",
        type: "error",
      });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  const types = [
    { value: "", label: "Todas" },
    { value: "ISSUED", label: t(INVOICE_TYPE, "ISSUED") },
    { value: "RECEIVED", label: t(INVOICE_TYPE, "RECEIVED") },
  ];

  const statuses = [
    { value: "", label: "Todos" },
    { value: "PENDING", label: t(INVOICE_STATUS, "PENDING") },
    { value: "PAID", label: t(INVOICE_STATUS, "PAID") },
    { value: "OVERDUE", label: t(INVOICE_STATUS, "OVERDUE") },
    { value: "PARTIAL", label: t(INVOICE_STATUS, "PARTIAL") },
    { value: "PROVISIONED", label: t(INVOICE_STATUS, "PROVISIONED") },
    { value: "WRITTEN_OFF", label: t(INVOICE_STATUS, "WRITTEN_OFF") },
    { value: "CANCELLED", label: t(INVOICE_STATUS, "CANCELLED") },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Facturas" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Facturas</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark transition-colors"
            >
              <Upload size={16} />
              Importar facturas
            </button>
            <div className="flex items-center gap-0 bg-white border border-subtle rounded-md overflow-hidden">
              {types.map((tp) => (
                <button
                  key={tp.value}
                  onClick={() => {
                    setType(tp.value);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-[13px] font-medium ${
                    type === tp.value
                      ? "bg-accent text-white"
                      : "text-text-secondary hover:bg-hover"
                  }`}
                >
                  {tp.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (invoices.length === 0) return;
                const headers = [
                  "Nº",
                  "Fecha",
                  "Tipo",
                  "Contacto",
                  "Descripción",
                  "Base",
                  "IVA",
                  "Total",
                  "Estado",
                ];
                const rows = invoices.map((inv) => [
                  inv.number ?? "",
                  inv.issueDate
                    ? new Date(inv.issueDate as string | Date).toISOString().slice(0, 10)
                    : "",
                  inv.type ?? "",
                  (inv.contact?.name ?? "").replace(/;/g, ","),
                  (inv.description ?? "").replace(/;/g, ","),
                  String(inv.netAmount ?? ""),
                  String(inv.vatAmount ?? ""),
                  String(inv.totalAmount ?? ""),
                  inv.status ?? "",
                ]);
                const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `facturas_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 text-[13px] font-medium px-4 h-9 rounded-md border border-subtle text-text-primary hover:bg-hover"
            >
              <Download size={16} />
              Exportar
            </button>
          </div>
        </div>

        {/* Import modal */}
        {showImport && (
          <InvoiceImportModal
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              setShowImport(false);
              setPage(1);
              refetch();
            }}
          />
        )}

        {/* PDF viewer */}
        {viewingPdf && (
          <PdfViewer
            invoiceId={viewingPdf.id}
            invoiceNumber={viewingPdf.number}
            onClose={() => setViewingPdf(null)}
          />
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 px-3 text-[13px] bg-white border border-subtle rounded-md text-text-secondary"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nº, cliente..."
            className="h-8 px-3 text-[13px] bg-white border border-subtle rounded-md w-64 placeholder:text-text-tertiary"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-text-tertiary">
            {total} facturas
            {hasActiveFilter && aggregateTotal ? ` · Total: ${formatAmount(aggregateTotal)}` : ""}
          </p>
          {selected.size > 0 && (
            <button
              onClick={() => requestDelete(Array.from(selected))}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 h-8 bg-red text-white text-[13px] font-medium rounded-md hover:bg-red-text transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              Eliminar {selected.size} seleccionada{selected.size > 1 ? "s" : ""}
            </button>
          )}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin facturas"
            description="Importa facturas en PDF o sincroniza desde Holded."
          />
        ) : (
          <>
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              <div className="flex items-center h-10 px-5 border-b border-subtle text-xs font-semibold text-text-secondary">
                <span className="w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === invoices.length && invoices.length > 0}
                    onChange={toggleAll}
                    className="rounded border-subtle cursor-pointer"
                  />
                </span>
                <span className="w-24">Nº Factura</span>
                <span className="w-24">Fecha</span>
                <span className="w-[160px]">Cliente/Proveedor</span>
                <span className="flex-1">Concepto</span>
                <span className="w-[110px] text-right">Importe</span>
                <span className="w-20 text-center">Estado</span>
                <span className="w-20 text-center">Acciones</span>
              </div>
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className={`flex items-center h-12 px-5 text-[13px] border-b border-border-light hover:bg-page transition-colors ${selected.has(inv.id) ? "bg-accent-light/30" : ""}`}
                >
                  <span className="w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      className="rounded border-subtle cursor-pointer"
                    />
                  </span>
                  <span
                    className="w-24 font-medium text-accent cursor-pointer hover:underline"
                    onClick={() => setSelectedInvoiceId(inv.id)}
                  >
                    {inv.number}
                    {(inv.type === "CREDIT_ISSUED" || inv.type === "CREDIT_RECEIVED") && (
                      <span className="ml-1 inline-flex px-1 py-0 rounded text-[9px] font-bold bg-purple-100 text-purple-700">
                        NC
                      </span>
                    )}
                  </span>
                  <span className="w-24 text-text-secondary">{formatDate(inv.issueDate)}</span>
                  <span className="w-[160px] text-text-primary truncate">
                    {inv.contact?.name ?? "—"}
                  </span>
                  <span className="flex-1 text-text-secondary truncate">
                    {inv.description ||
                      (
                        (inv as Record<string, unknown>).lines as
                          | { description?: string }[]
                          | undefined
                      )?.[0]?.description ||
                      "—"}
                  </span>
                  <span className="w-[110px] text-right font-mono font-medium text-text-primary">
                    {formatAmount(inv.totalAmount)}
                  </span>
                  <span className="w-20 flex justify-center">
                    <Badge value={inv.status} />
                  </span>
                  <span className="w-20 flex justify-center gap-1">
                    {(inv as Record<string, unknown>).pdfUrl != null && (
                      <button
                        onClick={() => setViewingPdf({ id: inv.id, number: inv.number })}
                        className="p-1 rounded hover:bg-accent-light text-accent"
                        title="Ver PDF"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => requestDelete([inv.id])}
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
      {selectedInvoiceId && (
        <InvoiceDetailPanel
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.length === 1
            ? "¿Eliminar esta factura?"
            : `¿Eliminar ${pendingDelete?.length} facturas?`
        }
        description={
          pendingDelete?.length === 1
            ? "La factura será eliminada permanentemente. Esta acción no se puede deshacer."
            : `Se eliminarán ${pendingDelete?.length} facturas permanentemente. Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Invoice Detail Panel
// ══════════════════════════════════════════════════════════════

interface InvoiceDetail {
  id: string;
  number: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  totalAmount: number;
  netAmount: number | null;
  vatAmount: number | null;
  currency: string;
  description: string | null;
  amountPaid: number;
  amountPending: number | null;
  pdfUrl: string | null;
  contact: {
    id: string;
    name: string;
    cif?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  lines: {
    id: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    vatRate: number | null;
  }[];
  payments: { id: string; date: string; amount: number }[];
  reconciliations: {
    id: string;
    status: string;
    confidenceScore: number;
    bankTransaction: { id: string; concept: string; amount: number; valueDate: string } | null;
  }[];
}

function InvoiceDetailPanel({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<InvoiceDetail>(`/api/invoices/${invoiceId}`)
      .then((data) => {
        if (!cancelled) setInvoice(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-[480px] bg-white shadow-xl border-l border-subtle overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-5 border-b border-subtle">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary">
              {invoice?.number ?? "Cargando..."}
            </h2>
            {invoice && (
              <>
                <Badge value={invoice.type} />
                <Badge value={invoice.status} />
              </>
            )}
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <LoadingSpinner />
          </div>
        ) : !invoice ? (
          <div className="p-5 text-center text-text-tertiary text-[13px]">
            Error al cargar factura
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-5">
            {/* Invoice data grid */}
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <span className="text-[11px] text-text-tertiary block">Fecha emisión</span>
                <span className="text-text-primary">{formatDate(invoice.issueDate)}</span>
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Fecha vencimiento</span>
                <span className="text-text-primary">
                  {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Contacto</span>
                <span className="text-text-primary">{invoice.contact?.name ?? "—"}</span>
                {invoice.contact?.cif && (
                  <span className="text-[11px] text-text-tertiary ml-1">
                    ({invoice.contact.cif})
                  </span>
                )}
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Moneda</span>
                <span className="text-text-primary">{invoice.currency}</span>
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Base imponible</span>
                <span className="text-text-primary font-mono">
                  {invoice.netAmount != null ? formatAmount(invoice.netAmount) : "—"}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">IVA</span>
                <span className="text-text-primary font-mono">
                  {invoice.vatAmount != null ? formatAmount(invoice.vatAmount) : "—"}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Total</span>
                <span className="text-text-primary font-mono font-semibold">
                  {formatAmount(invoice.totalAmount)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-text-tertiary block">Cobrado</span>
                <span className="text-text-primary font-mono">
                  {formatAmount(invoice.amountPaid)}
                </span>
              </div>
            </div>

            {/* Lines table */}
            {invoice.lines.length > 0 && (
              <div>
                <h3 className="text-[12px] font-semibold text-text-secondary mb-2 uppercase">
                  Líneas
                </h3>
                <div className="border border-subtle rounded-lg overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-context border-b border-subtle text-text-secondary">
                        <th className="px-3 py-1.5 text-left font-medium">Descripción</th>
                        <th className="px-3 py-1.5 text-right font-medium">Cant.</th>
                        <th className="px-3 py-1.5 text-right font-medium">Precio</th>
                        <th className="px-3 py-1.5 text-right font-medium">IVA</th>
                        <th className="px-3 py-1.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lines.map((line) => (
                        <tr key={line.id} className="border-b border-subtle">
                          <td className="px-3 py-1.5 text-text-primary max-w-[180px] truncate">
                            {line.description ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{line.quantity}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {formatAmount(line.unitPrice)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {line.vatRate != null ? `${line.vatRate}%` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium">
                            {formatAmount(line.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payments table */}
            {invoice.payments.length > 0 && (
              <div>
                <h3 className="text-[12px] font-semibold text-text-secondary mb-2 uppercase">
                  Pagos
                </h3>
                <div className="border border-subtle rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-context border-b border-subtle text-text-secondary">
                        <th className="px-3 py-1.5 text-left font-medium">Fecha</th>
                        <th className="px-3 py-1.5 text-right font-medium">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.payments.map((pay) => (
                        <tr key={pay.id} className="border-b border-subtle">
                          <td className="px-3 py-1.5">{formatDate(pay.date)}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium">
                            {formatAmount(pay.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reconciliations */}
            {invoice.reconciliations.length > 0 && (
              <div>
                <h3 className="text-[12px] font-semibold text-text-secondary mb-2 uppercase">
                  Conciliaciones
                </h3>
                <div className="flex flex-col gap-2">
                  {invoice.reconciliations.map((r) => (
                    <div key={r.id} className="border border-subtle rounded-lg p-3 text-[12px]">
                      <div className="flex items-center justify-between">
                        <Badge value={r.status} />
                        <span className="font-mono text-text-secondary">
                          {Math.round(r.confidenceScore * 100)}%
                        </span>
                      </div>
                      {r.bankTransaction && (
                        <p className="mt-1 text-text-secondary truncate">
                          {formatDate(r.bankTransaction.valueDate)} ·{" "}
                          {formatAmount(r.bankTransaction.amount)} · {r.bankTransaction.concept}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Invoice Import Modal
// ══════════════════════════════════════════════════════════════

function InvoiceImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [mode, setMode] = useState<"local" | "drive">("local");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
    results?: { filename: string; number: string | null; status: string }[];
  } | null>(null);
  const [error, setError] = useState("");

  async function handleLocalUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    for (const f of files) formData.append("files", f);

    try {
      const token = await getToken();
      const res = await fetch("/api/invoices/import", {
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
      if (data.created > 0) setTimeout(onSuccess, 1000);
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
    }
  }

  async function handleDriveImport() {
    if (!driveFolderId) return;
    setUploading(true);
    setError("");
    setResult(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/invoices/import-drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ folderId: driveFolderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al importar");
        return;
      }
      setResult(data);
      if (data.created > 0) setTimeout(onSuccess, 1000);
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    setFiles((prev) => [...prev, ...dropped]);
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={uploading ? undefined : onClose}
    >
      <div
        className="bg-white rounded-lg border border-subtle w-full max-w-xl shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Processing overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4 rounded-lg">
            <div className="w-10 h-10 border-[3px] border-subtle border-t-accent rounded-full animate-spin" />
            <span className="text-[15px] font-semibold text-text-primary">
              Analizando facturas con IA...
            </span>
            <span className="text-[12px] text-text-secondary text-center max-w-xs">
              Claude está extrayendo los datos de cada PDF.
              {mode === "local" &&
                files.length > 0 &&
                ` Procesando ${files.length} archivo${files.length > 1 ? "s" : ""}.`}{" "}
              Esto puede tardar unos segundos por factura.
            </span>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 h-1.5 bg-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full animate-pulse"
                  style={{ width: "60%" }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-5 border-b border-subtle">
          <h2 className="text-[15px] font-semibold text-text-primary">Importar facturas</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-text-tertiary hover:text-text-primary disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-0 bg-white border border-subtle rounded-md overflow-hidden w-fit">
            <button
              onClick={() => setMode("local")}
              className={`px-4 py-1.5 text-[13px] font-medium flex items-center gap-1.5 ${mode === "local" ? "bg-accent text-white" : "text-text-secondary hover:bg-hover"}`}
            >
              <Upload size={14} />
              Desde ordenador
            </button>
            <button
              onClick={() => setMode("drive")}
              className={`px-4 py-1.5 text-[13px] font-medium flex items-center gap-1.5 ${mode === "drive" ? "bg-accent text-white" : "text-text-secondary hover:bg-hover"}`}
            >
              <FolderOpen size={14} />
              Desde Google Drive
            </button>
          </div>

          {mode === "local" ? (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-subtle rounded-lg p-6 text-center cursor-pointer hover:border-accent hover:bg-accent-light/20 transition-colors"
              >
                <FileText size={28} className="text-text-tertiary mx-auto mb-2" />
                {files.length > 0 ? (
                  <p className="text-[13px] text-text-primary font-medium">
                    {files.length} PDF{files.length > 1 ? "s" : ""} seleccionado
                    {files.length > 1 ? "s" : ""}
                  </p>
                ) : (
                  <>
                    <p className="text-[13px] text-text-primary">
                      Arrastra PDFs aquí o haz click para seleccionar
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-1">
                      Puedes seleccionar múltiples archivos
                    </p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) =>
                    setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])
                  }
                  className="hidden"
                />
              </div>
              {files.length > 0 && (
                <div className="max-h-32 overflow-auto text-xs text-text-secondary">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span>{f.name}</span>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-red-text text-[11px]"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                ID de carpeta de Google Drive
              </label>
              <input
                type="text"
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md placeholder:text-text-tertiary"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                Copia el ID de la URL de la carpeta. Requiere Google Drive conectado en Ajustes.
              </p>
            </div>
          )}

          <div className="bg-page rounded-md p-3 text-[11px] text-text-secondary">
            <p className="font-medium text-text-primary mb-1">
              Cada PDF se analiza con Claude AI para extraer:
            </p>
            <p>Nº factura, fecha, importe, IVA, proveedor/cliente, CIF, líneas de detalle</p>
          </div>

          {error && <p className="text-xs text-red-text bg-red-light px-3 py-2 rounded">{error}</p>}

          {result && (
            <div
              className={`text-xs px-3 py-2 rounded ${result.created > 0 ? "bg-green-light text-green-text" : "bg-amber-light text-amber-text"}`}
            >
              <p className="font-medium">
                {result.created} facturas importadas
                {result.skipped > 0 ? ` · ${result.skipped} duplicadas` : ""}
              </p>
              {result.results && result.results.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">Detalle</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {result.results.map((r, i) => (
                      <li key={i}>
                        {r.filename} →{" "}
                        {r.status === "created"
                          ? `✓ ${r.number}`
                          : r.status === "duplicate"
                            ? `= duplicada (${r.number})`
                            : "✗ error"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
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

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="h-9 px-4 text-[13px] text-text-secondary border border-subtle rounded-md hover:bg-hover"
            >
              Cancelar
            </button>
            <button
              onClick={mode === "local" ? handleLocalUpload : handleDriveImport}
              disabled={uploading || (mode === "local" ? files.length === 0 : !driveFolderId)}
              className="h-9 px-4 bg-accent text-white text-[13px] font-medium rounded-md hover:bg-accent-dark disabled:opacity-50 flex items-center gap-2"
            >
              <Upload size={14} />
              {uploading ? "Procesando con IA..." : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PDF Viewer Modal
// ══════════════════════════════════════════════════════════════

function PdfViewer({
  invoiceId,
  invoiceNumber,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-subtle">
          <h2 className="text-[15px] font-semibold text-text-primary">Factura {invoiceNumber}</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 p-0">
          <iframe
            src={`/api/invoices/${invoiceId}/pdf`}
            className="w-full h-full rounded-b-lg"
            title={`PDF ${invoiceNumber}`}
          />
        </div>
      </div>
    </div>
  );
}

// Helper
async function getToken(): Promise<string | null> {
  const { getSupabase } = await import("@/lib/api-client");
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { session },
  } = await sb.auth.getSession();
  return session?.access_token ?? null;
}
