"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { FileCheck, Plus, RefreshCw, PieChart } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/Toast";
import { formatAmount, formatTableDate } from "@/lib/format";

interface SupportingDoc {
  id: string;
  type: string;
  reference: string | null;
  description: string;
  date: string;
  amount: number;
  status: string;
  debitAccountCode: string;
  creditAccountCode: string;
  cashflowType: string;
  contact?: { name: string; cif: string | null } | null;
  journalEntry?: { id: string; number: number; status: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: "bg-blue/10 text-blue-700",
  PENDING_APPROVAL: "bg-amber/10 text-amber-700",
  POSTED: "bg-green/10 text-green-text",
  RECONCILED: "bg-accent-light text-accent",
  CANCELLED: "bg-subtle text-text-tertiary",
};

const TYPE_LABELS: Record<string, string> = {
  ACTA_JUNTA: "Acta de junta",
  ESCRITURA: "Escritura",
  CONTRATO_PRESTAMO: "Contrato de pr\u00e9stamo",
  RESOLUCION_SUBVENCION: "Subvenci\u00f3n",
  LIQUIDACION_INTERESES: "Liquidaci\u00f3n intereses",
  MODELO_FISCAL: "Modelo fiscal",
  RECIBO_NOMINA: "N\u00f3mina",
  POLIZA_SEGURO: "P\u00f3liza seguro",
  CONTRATO_ALQUILER: "Contrato alquiler",
  OTRO: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Registrado",
  PENDING_APPROVAL: "Pendiente",
  POSTED: "Contabilizado",
  RECONCILED: "Conciliado",
  CANCELLED: "Cancelado",
};

type FilterStatus = "ALL" | "REGISTERED" | "PENDING_APPROVAL" | "POSTED" | "RECONCILED";

export default function DocumentosSoportePage() {
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [showRegularization, setShowRegularization] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<{ id: string; description: string } | null>(
    null
  );
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const statusParam = filter === "ALL" ? "" : `&status=${filter}`;
  const { data, refetch } = useFetch<{
    data: SupportingDoc[];
    total: number;
    counts?: Record<string, number>;
  }>(`/api/supporting-documents?limit=50${statusParam}`);
  const docs = data?.data ?? [];
  const counts = data?.counts ?? {};

  // Create form state
  const [form, setForm] = useState({
    type: "OTRO",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    reference: "",
    debitAccountCode: "",
    creditAccountCode: "",
  });

  // Regularization form
  const [regYear, setRegYear] = useState(new Date().getFullYear() - 1);

  // Distribution form
  const [distForm, setDistForm] = useState({
    toReservaLegal: "",
    toReservasVoluntarias: "",
    toDividendos: "",
    toCompensarPerdidas: "",
  });

  async function handleCreate() {
    if (!form.description || !form.amount) return;
    setSaving(true);
    try {
      await api.post("/api/supporting-documents", {
        ...form,
        amount: parseFloat(form.amount),
        debitAccountCode: form.debitAccountCode || undefined,
        creditAccountCode: form.creditAccountCode || undefined,
        reference: form.reference || undefined,
      });
      setShowCreate(false);
      setForm({
        type: "OTRO",
        description: "",
        date: new Date().toISOString().slice(0, 10),
        amount: "",
        reference: "",
        debitAccountCode: "",
        creditAccountCode: "",
      });
      refetch();
    } catch {
      setToast({ message: "Error al registrar documento", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRegularization() {
    setSaving(true);
    try {
      await api.post("/api/supporting-documents/regularization", { fiscalYear: regYear });
      setShowRegularization(false);
      refetch();
    } catch {
      setToast({ message: "Error en regularización", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDistribution() {
    setSaving(true);
    try {
      await api.post("/api/supporting-documents/distribution", {
        toReservaLegal: parseFloat(distForm.toReservaLegal) || 0,
        toReservasVoluntarias: parseFloat(distForm.toReservasVoluntarias) || 0,
        toDividendos: parseFloat(distForm.toDividendos) || 0,
        toCompensarPerdidas: parseFloat(distForm.toCompensarPerdidas) || 0,
      });
      setShowDistribution(false);
      setDistForm({
        toReservaLegal: "",
        toReservasVoluntarias: "",
        toDividendos: "",
        toCompensarPerdidas: "",
      });
      refetch();
    } catch {
      setToast({ message: "Error en distribución", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function executeCancel() {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await api.delete(`/api/supporting-documents/${pendingCancel.id}`);
      refetch();
      setToast({ message: "Documento cancelado", type: "success" });
    } catch {
      setToast({ message: "Error al cancelar documento", type: "error" });
    } finally {
      setCancelling(false);
      setPendingCancel(null);
    }
  }

  async function handleAdvanceStatus(id: string, newStatus: "POSTED" | "RECONCILED") {
    try {
      await api.patch(`/api/supporting-documents/${id}`, { status: newStatus });
      refetch();
      setToast({
        message: newStatus === "POSTED" ? "Documento contabilizado" : "Documento conciliado",
        type: "success",
      });
    } catch {
      setToast({ message: "Error al avanzar estado del documento", type: "error" });
    }
  }

  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const filters: { label: string; value: FilterStatus }[] = [
    { label: `Todos${allCount ? ` (${allCount})` : ""}`, value: "ALL" },
    {
      label: `Registrado${counts.REGISTERED ? ` (${counts.REGISTERED})` : ""}`,
      value: "REGISTERED",
    },
    {
      label: `Pendiente${counts.PENDING_APPROVAL ? ` (${counts.PENDING_APPROVAL})` : ""}`,
      value: "PENDING_APPROVAL",
    },
    { label: `Contabilizado${counts.POSTED ? ` (${counts.POSTED})` : ""}`, value: "POSTED" },
    {
      label: `Conciliado${counts.RECONCILED ? ` (${counts.RECONCILED})` : ""}`,
      value: "RECONCILED",
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck size={20} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">Documentos soporte</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRegularization(true)}
            className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium border border-subtle rounded-md text-text-secondary hover:bg-hover"
          >
            <RefreshCw size={14} />
            Regularizaci&oacute;n
          </button>
          <button
            onClick={() => setShowDistribution(true)}
            className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium border border-subtle rounded-md text-text-secondary hover:bg-hover"
          >
            <PieChart size={14} />
            Distribuci&oacute;n
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium bg-accent text-white rounded-md hover:bg-accent/90"
          >
            <Plus size={14} />
            Nuevo documento
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`h-7 px-3 text-[12px] font-medium rounded-md transition-colors ${
              filter === f.value
                ? "bg-accent text-white"
                : "bg-subtle text-text-secondary hover:bg-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-subtle rounded-lg overflow-x-auto">
        <table className="w-full min-w-[850px] text-[13px]">
          <thead>
            <tr className="bg-context border-b border-subtle text-left text-[11px] text-text-secondary uppercase">
              <th className="px-4 py-2 font-semibold">Fecha</th>
              <th className="px-4 py-2 font-semibold">Tipo</th>
              <th className="px-4 py-2 font-semibold">Referencia</th>
              <th className="px-4 py-2 font-semibold">Descripci&oacute;n</th>
              <th className="px-4 py-2 font-semibold text-right">Importe</th>
              <th className="px-4 py-2 font-semibold min-w-[120px]">Estado</th>
              <th className="px-4 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary text-[12px]">
                  Sin documentos soporte
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className="border-b border-subtle hover:bg-hover/50">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatTableDate(doc.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue/10 text-blue-700">
                      {TYPE_LABELS[doc.type] ?? doc.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-text-secondary">
                    {doc.reference ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 max-w-[250px] truncate">{doc.description}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatAmount(doc.amount)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[doc.status] ?? "bg-subtle text-text-tertiary"}`}
                    >
                      {STATUS_LABELS[doc.status] ?? doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {(doc.status === "REGISTERED" || doc.status === "PENDING_APPROVAL") && (
                        <button
                          onClick={() => handleAdvanceStatus(doc.id, "POSTED")}
                          className="text-[11px] text-accent hover:underline"
                        >
                          Contabilizar
                        </button>
                      )}
                      {doc.status === "POSTED" && (
                        <button
                          onClick={() => handleAdvanceStatus(doc.id, "RECONCILED")}
                          className="text-[11px] text-accent hover:underline"
                        >
                          Conciliar
                        </button>
                      )}
                      {doc.status !== "CANCELLED" && doc.status !== "RECONCILED" && (
                        <button
                          onClick={() =>
                            setPendingCancel({
                              id: doc.id,
                              description: doc.description || doc.type,
                            })
                          }
                          className="text-[11px] text-red hover:underline"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-auto">
            <h2 className="text-[15px] font-semibold text-text-primary mb-4">
              Nuevo documento soporte
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px]"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">
                  Descripci&oacute;n *
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px]"
                  placeholder="Descripci&oacute;n del documento..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-text-secondary mb-1 block">Fecha</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-secondary mb-1 block">Importe *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">Referencia</label>
                <input
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px]"
                  placeholder="N.&ordm; documento, protocolo..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-text-secondary mb-1 block">Cuenta debe</label>
                  <input
                    value={form.debitAccountCode}
                    onChange={(e) => setForm((f) => ({ ...f, debitAccountCode: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                    placeholder="Auto"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-secondary mb-1 block">Cuenta haber</label>
                  <input
                    value={form.creditAccountCode}
                    onChange={(e) => setForm((f) => ({ ...f, creditAccountCode: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                    placeholder="Auto"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="h-8 px-4 text-[13px] text-text-secondary border border-subtle rounded-md"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.description || !form.amount}
                className="h-8 px-4 text-[13px] bg-accent text-white rounded-md disabled:opacity-50"
              >
                {saving ? "Registrando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regularization modal */}
      {showRegularization && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[360px]">
            <h2 className="text-[15px] font-semibold text-text-primary mb-3">
              Regularizaci&oacute;n de resultados
            </h2>
            <p className="text-[12px] text-text-secondary mb-4">
              Cierra las cuentas de gastos (grupo 6) e ingresos (grupo 7) y transfiere el resultado
              a la cuenta 129.
            </p>
            <div className="mb-4">
              <label className="text-[11px] text-text-secondary mb-1 block">Ejercicio fiscal</label>
              <input
                type="number"
                value={regYear}
                onChange={(e) => setRegYear(parseInt(e.target.value))}
                className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRegularization(false)}
                className="h-8 px-4 text-[13px] text-text-secondary border border-subtle rounded-md"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegularization}
                disabled={saving}
                className="h-8 px-4 text-[13px] bg-accent text-white rounded-md disabled:opacity-50"
              >
                {saving ? "Procesando..." : "Ejecutar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Distribution modal */}
      {showDistribution && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]">
            <h2 className="text-[15px] font-semibold text-text-primary mb-3">
              Distribuci&oacute;n de resultados
            </h2>
            <p className="text-[12px] text-text-secondary mb-4">
              Distribuye el saldo de la cuenta 129. La suma de los importes debe coincidir con el
              resultado del ejercicio.
            </p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">
                  Reserva legal (112)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={distForm.toReservaLegal}
                  onChange={(e) => setDistForm((f) => ({ ...f, toReservaLegal: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">
                  Reservas voluntarias (113)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={distForm.toReservasVoluntarias}
                  onChange={(e) =>
                    setDistForm((f) => ({ ...f, toReservasVoluntarias: e.target.value }))
                  }
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">
                  Dividendos (526)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={distForm.toDividendos}
                  onChange={(e) => setDistForm((f) => ({ ...f, toDividendos: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">
                  Compensar p&eacute;rdidas anteriores (120)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={distForm.toCompensarPerdidas}
                  onChange={(e) =>
                    setDistForm((f) => ({ ...f, toCompensarPerdidas: e.target.value }))
                  }
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px] font-mono"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowDistribution(false)}
                className="h-8 px-4 text-[13px] text-text-secondary border border-subtle rounded-md"
              >
                Cancelar
              </button>
              <button
                onClick={handleDistribution}
                disabled={saving}
                className="h-8 px-4 text-[13px] bg-accent text-white rounded-md disabled:opacity-50"
              >
                {saving ? "Procesando..." : "Distribuir"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingCancel !== null}
        title="¿Cancelar este documento?"
        description={`Cancelar "${pendingCancel?.description}" puede afectar a los asientos contables asociados. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, cancelar"
        variant="destructive"
        loading={cancelling}
        onConfirm={executeCancel}
        onCancel={() => setPendingCancel(null)}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
