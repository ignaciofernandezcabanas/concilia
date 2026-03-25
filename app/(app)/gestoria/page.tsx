"use client";

import { useState, useRef } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import Badge from "@/components/Badge";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import {
  AlertTriangle,
  FileText,
  Upload,
  MessageSquare,
  Package,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
} from "lucide-react";

// ── Types ──

interface Alert {
  priority: "urgent" | "high" | "normal" | "info";
  title: string;
  description: string;
  dueDate: string | null;
  fiscalRef: string | null;
  companyName: string | null;
}

interface Draft {
  model: string;
  modelName: string;
  period: string;
  status: "ready" | "pending" | "not_applicable";
  description: string;
}

interface Incident {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
}

interface GestoriaConfig {
  id: string;
  gestoriaName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  accessLevel: string;
  manages: string[];
}

type TabKey = "alerts" | "drafts" | "upload" | "incidents" | "package";

export default function GestoriaPage() {
  const [tab, setTab] = useState<TabKey>("alerts");

  const { data: configData, loading: configLoading } = useFetch<{
    config: GestoriaConfig | null;
  }>("/api/gestoria/config");

  const tabs: { value: TabKey; label: string; icon: React.ElementType }[] = [
    { value: "alerts", label: "Alertas", icon: AlertTriangle },
    { value: "drafts", label: "Borradores", icon: FileText },
    { value: "upload", label: "Subir docs", icon: Upload },
    { value: "incidents", label: "Incidencias", icon: MessageSquare },
    { value: "package", label: "Paquete fiscal", icon: Package },
  ];

  if (configLoading) {
    return (
      <div className="flex flex-col min-h-full">
        <TopBar title="Gestoría" />
        <div className="flex items-center justify-center flex-1">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  const config = configData?.config;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Gestoría" />
      <div className="flex flex-col gap-6 p-6 px-8 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Portal Gestoría</h1>
          {config && (
            <span className="text-[13px] text-text-secondary">
              {config.gestoriaName ?? "Sin nombre"} — Nivel:{" "}
              <Badge value={config.accessLevel} label={config.accessLevel} />
            </span>
          )}
        </div>

        {!config && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-[13px] text-amber-800">
              Gestoría no configurada. Ve a{" "}
              <a href="/ajustes?tab=gestoria" className="underline font-medium">
                Ajustes → Gestoría
              </a>{" "}
              para configurar los datos de tu gestoría.
            </p>
          </div>
        )}

        {config && (
          <>
            {/* Summary cards */}
            <SummaryCards />

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-subtle overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`flex items-center gap-1.5 px-4 pb-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    tab === t.value
                      ? "border-accent text-accent"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "alerts" && <AlertsTab />}
            {tab === "drafts" && <DraftsTab />}
            {tab === "upload" && <UploadTab />}
            {tab === "incidents" && <IncidentsTab />}
            {tab === "package" && <PackageTab />}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Summary Cards
// ══════════════════════════════════════════════════════════════

function SummaryCards() {
  const { data: alertsData } = useFetch<{ alerts: Alert[] }>("/api/gestoria/alerts");
  const { data: draftsData } = useFetch<{ drafts: Draft[] }>("/api/gestoria/drafts");
  const { data: incidentsData } = useFetch<{ incidents: Incident[] }>("/api/gestoria/incidents");

  const urgentAlerts =
    alertsData?.alerts?.filter((a) => a.priority === "urgent" || a.priority === "high").length ?? 0;
  const readyDrafts = draftsData?.drafts?.filter((d) => d.status === "ready").length ?? 0;
  const openIncidents = incidentsData?.incidents?.filter((i) => !i.isRead).length ?? 0;

  const cards = [
    {
      label: "Alertas urgentes",
      value: urgentAlerts,
      color: urgentAlerts > 0 ? "text-red" : "text-green-600",
      icon: AlertTriangle,
    },
    {
      label: "Borradores listos",
      value: readyDrafts,
      color: "text-accent",
      icon: FileText,
    },
    {
      label: "Incidencias abiertas",
      value: openIncidents,
      color: openIncidents > 0 ? "text-amber-600" : "text-text-secondary",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-lg border border-subtle p-4 flex items-center gap-3"
        >
          <c.icon size={20} className={c.color} />
          <div>
            <div className={`text-[20px] font-bold ${c.color}`}>{c.value}</div>
            <div className="text-[12px] text-text-secondary">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Alerts Tab
// ══════════════════════════════════════════════════════════════

function AlertsTab() {
  const { data, loading } = useFetch<{ alerts: Alert[] }>("/api/gestoria/alerts");

  if (loading) return <LoadingSpinner />;

  const alerts = data?.alerts ?? [];

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary text-[13px]">
        <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
        No hay alertas fiscales pendientes.
      </div>
    );
  }

  const priorityOrder = { urgent: 0, high: 1, normal: 2, info: 3 };
  const sorted = [...alerts].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((alert, i) => (
        <div
          key={i}
          className={`bg-white rounded-lg border p-4 ${
            alert.priority === "urgent"
              ? "border-red bg-red-50"
              : alert.priority === "high"
                ? "border-amber-300 bg-amber-50"
                : "border-subtle"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge value={alert.priority} label={alert.priority.toUpperCase()} />
            <span className="text-[14px] font-medium text-text-primary">{alert.title}</span>
            {alert.dueDate && (
              <span className="text-[11px] text-text-tertiary ml-auto">Vence: {alert.dueDate}</span>
            )}
          </div>
          <p className="text-[13px] text-text-secondary">{alert.description}</p>
          {alert.fiscalRef && (
            <span className="text-[11px] text-text-tertiary mt-1 inline-block">
              Ref: {alert.fiscalRef}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Drafts Tab
// ══════════════════════════════════════════════════════════════

function DraftsTab() {
  const { data, loading } = useFetch<{ drafts: Draft[] }>("/api/gestoria/drafts");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<Record<string, unknown> | null>(null);

  if (loading) return <LoadingSpinner />;

  const drafts = data?.drafts ?? [];

  async function handleReview(model: string, period: string) {
    const key = `${model}-${period}`;
    if (expanded === key) {
      setExpanded(null);
      setReviewResult(null);
      return;
    }
    setExpanded(key);
    setReviewing(true);
    setReviewResult(null);
    try {
      const res = await api.get<{ review: Record<string, unknown> }>(
        `/api/gestoria/drafts/${model}/${period}`
      );
      setReviewResult(res.review);
    } catch {
      setReviewResult({ status: "error", summary: "Error al revisar borrador" });
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {drafts.map((d) => {
        const key = `${d.model}-${d.period}`;
        const isExpanded = expanded === key;
        return (
          <div key={key} className="bg-white rounded-lg border border-subtle">
            <button
              onClick={() => handleReview(d.model, d.period)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-medium text-text-primary">Modelo {d.model}</span>
                <span className="text-[13px] text-text-secondary">{d.period}</span>
                <Badge
                  value={d.status}
                  label={
                    d.status === "ready" ? "Listo" : d.status === "pending" ? "Pendiente" : "N/A"
                  }
                />
              </div>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-subtle pt-3">
                {reviewing ? (
                  <LoadingSpinner />
                ) : reviewResult ? (
                  <div className="text-[13px] text-text-secondary">
                    <p className="font-medium mb-1">
                      Estado:{" "}
                      <Badge
                        value={String(reviewResult.status)}
                        label={String(reviewResult.status).toUpperCase()}
                      />
                    </p>
                    <p>{String(reviewResult.summary ?? "")}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Upload Tab
// ══════════════════════════════════════════════════════════════

function UploadTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    filename: string;
    classification: { documentType: string; confidence: number };
  } | null>(null);
  const [error, setError] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/gestoria/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir archivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-dashed border-subtle p-8 text-center">
        <Upload size={32} className="mx-auto mb-3 text-text-tertiary" />
        <p className="text-[14px] text-text-secondary mb-3">
          Arrastra un archivo o haz click para subir
        </p>
        <input
          ref={fileRef}
          type="file"
          onChange={handleUpload}
          accept=".pdf,.xlsx,.xls,.csv,.jpg,.png"
          className="hidden"
          id="gestoria-upload"
        />
        <label
          htmlFor="gestoria-upload"
          className="inline-flex items-center gap-2 bg-accent text-white text-[13px] font-medium px-4 h-9 rounded-md hover:bg-accent-dark transition-colors cursor-pointer"
        >
          {uploading ? "Subiendo..." : "Seleccionar archivo"}
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-600" />
            <span className="text-[14px] font-medium text-green-800">
              Archivo subido correctamente
            </span>
          </div>
          <p className="text-[13px] text-green-700">
            <strong>{result.filename}</strong> — Tipo detectado:{" "}
            {result.classification.documentType} (confianza:{" "}
            {(result.classification.confidence * 100).toFixed(0)}%)
          </p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Incidents Tab
// ══════════════════════════════════════════════════════════════

function IncidentsTab() {
  const { data, loading, refetch } = useFetch<{ incidents: Incident[] }>("/api/gestoria/incidents");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/gestoria/incidents", { title, description, severity });
      setTitle("");
      setDescription("");
      setSeverity("medium");
      refetch();
    } catch (err) {
      console.error("Error creating incident:", err);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  const incidents = data?.incidents ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Create incident form */}
      <form
        onSubmit={handleCreate}
        className="bg-white rounded-lg border border-subtle p-4 flex flex-col gap-3"
      >
        <h3 className="text-[14px] font-medium text-text-primary">Nueva incidencia</h3>
        <input
          type="text"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-9 px-3 text-[13px] border border-subtle rounded-md"
          required
        />
        <textarea
          placeholder="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-20 px-3 py-2 text-[13px] border border-subtle rounded-md resize-none"
          required
        />
        <div className="flex items-center gap-3">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-9 px-3 text-[13px] border border-subtle rounded-md"
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="h-9 px-4 bg-accent text-white text-[13px] font-medium rounded-md disabled:opacity-50"
          >
            {creating ? "Creando..." : "Crear incidencia"}
          </button>
        </div>
      </form>

      {/* Incidents list */}
      {incidents.length === 0 ? (
        <div className="text-center py-8 text-text-secondary text-[13px]">
          No hay incidencias registradas.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {incidents.map((inc) => (
            <div key={inc.id} className="bg-white rounded-lg border border-subtle p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-text-tertiary" />
                <span className="text-[14px] font-medium text-text-primary">{inc.title}</span>
                <span className="text-[11px] text-text-tertiary ml-auto">
                  {new Date(inc.createdAt).toLocaleString("es-ES")}
                </span>
              </div>
              <p className="text-[13px] text-text-secondary">{inc.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Package Tab
// ══════════════════════════════════════════════════════════════

function PackageTab() {
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const prevYear = currentQuarter === 1 ? now.getFullYear() - 1 : now.getFullYear();
  const period = `T${prevQuarter}-${prevYear}`;

  const { data, loading } = useFetch<{
    package: Record<string, unknown>;
  }>(`/api/gestoria/package/${period}`);

  if (loading) return <LoadingSpinner />;

  const pkg = data?.package as Record<string, unknown> | undefined;

  if (!pkg) {
    return (
      <div className="text-center py-8 text-text-secondary text-[13px]">
        No hay datos disponibles para el periodo {period}.
      </div>
    );
  }

  const m303 = pkg.modelo303 as Record<string, number> | undefined;
  const m111 = pkg.modelo111 as Record<string, number> | undefined;
  const aging = pkg.aging as Record<string, number> | undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-text-primary">Paquete fiscal — {period}</h3>
        <span className="text-[11px] text-text-tertiary">
          Generado: {String(pkg.generatedAt ?? "").slice(0, 10)}
        </span>
      </div>

      {/* 303 IVA */}
      <div className="bg-white rounded-lg border border-subtle p-4">
        <h4 className="text-[14px] font-medium text-text-primary mb-3">Modelo 303 — IVA</h4>
        {m303 ? (
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div>
              Base imponible:{" "}
              <span className="font-medium">
                {Number(m303.baseImponible).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                })}
                €
              </span>
            </div>
            <div>
              IVA repercutido:{" "}
              <span className="font-medium">
                {Number(m303.ivaRepercutido).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                })}
                €
              </span>
            </div>
            <div>
              IVA soportado:{" "}
              <span className="font-medium">
                {Number(m303.ivaSoportado).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                })}
                €
              </span>
            </div>
            <div>
              Cuota diferencial:{" "}
              <span
                className={`font-medium ${Number(m303.cuotaDiferencial) >= 0 ? "text-red" : "text-green-600"}`}
              >
                {Number(m303.cuotaDiferencial).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                })}
                €
              </span>
            </div>
          </div>
        ) : (
          <p className="text-text-secondary text-[13px]">Sin datos</p>
        )}
      </div>

      {/* 111 Retenciones */}
      <div className="bg-white rounded-lg border border-subtle p-4">
        <h4 className="text-[14px] font-medium text-text-primary mb-3">Modelo 111 — Retenciones</h4>
        {m111 ? (
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div>
              Base retención:{" "}
              <span className="font-medium">
                {Number(m111.baseRetencion).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                })}
                €
              </span>
            </div>
            <div>
              Retención:{" "}
              <span className="font-medium">
                {Number(m111.retencion).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                })}
                €
              </span>
            </div>
            <div>
              Perceptores: <span className="font-medium">{m111.perceptores}</span>
            </div>
          </div>
        ) : (
          <p className="text-text-secondary text-[13px]">Sin datos</p>
        )}
      </div>

      {/* Aging */}
      <div className="bg-white rounded-lg border border-subtle p-4">
        <h4 className="text-[14px] font-medium text-text-primary mb-3">Resumen cobros</h4>
        {aging ? (
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div>
              Facturas vencidas: <span className="font-medium text-red">{aging.overdueCount}</span>
            </div>
            <div>
              Facturas pendientes: <span className="font-medium">{aging.pendingCount}</span>
            </div>
          </div>
        ) : (
          <p className="text-text-secondary text-[13px]">Sin datos</p>
        )}
      </div>
    </div>
  );
}
