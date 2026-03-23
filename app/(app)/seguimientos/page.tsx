"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Send, CheckCircle, AlertTriangle, XCircle, RotateCw, FileText,
} from "lucide-react";

interface Inquiry {
  id: string;
  triggerType: string;
  status: string;
  subject: string;
  body: string;
  bodyPlain: string;
  recipientEmail: string;
  recipientName: string;
  tone: string;
  followUpNumber: number;
  sentAt: string | null;
  createdAt: string;
  responseSummary: string | null;
  responseResolved: boolean | null;
  attachmentsReceived: number;
  nextFollowUpDate: string | null;
  responseType: string | null;
  responseConfidence: number | null;
  documentValidation: {
    matchesRequestedType?: boolean;
    amountMatch?: string;
    dateMatch?: string;
    contactMatch?: boolean;
    invoiceNumberFound?: string;
    extractedAmount?: number;
    extractedDate?: string;
    issues?: string[];
  } | null;
  proposedAction: string | null;
  proposedActionReason: string | null;
  proposedFollowUpBody: string | null;
  contact: { id: string; name: string; email?: string; accountingEmail?: string } | null;
  bankTransaction: { id: string; amount: number; concept: string; valueDate: string } | null;
  invoice: { id: string; number: string; totalAmount: number } | null;
  followUps: { id: string; status: string; followUpNumber: number }[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Mail; color: string; bg: string }> = {
  DRAFT: { label: "Borrador", icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
  FOLLOW_UP_DRAFT: { label: "Follow-up preparado", icon: RotateCw, color: "text-amber-600", bg: "bg-amber-50" },
  SENT: { label: "Enviado", icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
  RESPONSE_RECEIVED: { label: "Respuesta recibida", icon: Mail, color: "text-green-600", bg: "bg-green-50" },
  RESOLVED: { label: "Resuelto", icon: CheckCircle, color: "text-green-700", bg: "bg-green-50" },
  FOLLOW_UP_NEEDED: { label: "Necesita follow-up", icon: RotateCw, color: "text-orange-600", bg: "bg-orange-50" },
  ESCALATED: { label: "Escalado", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  CANCELLED: { label: "Cancelado", icon: XCircle, color: "text-gray-500", bg: "bg-gray-50" },
};

const TRIGGER_LABELS: Record<string, string> = {
  MISSING_INVOICE: "Factura faltante",
  MISSING_DOCUMENTATION: "Documentación pendiente",
  EXPENSE_CLARIFICATION: "Aclaración de gasto",
  IC_CONFIRMATION: "Confirmación IC",
};

export default function SeguimientosPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const fetchInquiries = useCallback(async () => {
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/inquiries${params}`);
      const json = await res.json();
      setInquiries(json.data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  const approveInquiry = async (id: string) => {
    setActing(true);
    try {
      await fetch(`/api/inquiries/${id}/approve`, { method: "POST" });
      fetchInquiries();
    } catch { /* ignore */ }
    setActing(false);
  };

  const rejectInquiry = async (id: string) => {
    setActing(true);
    try {
      await fetch(`/api/inquiries/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rechazado por el controller" }),
      });
      fetchInquiries();
    } catch { /* ignore */ }
    setActing(false);
  };

  // Group by actionable status
  const drafts = inquiries.filter((i) => ["DRAFT", "FOLLOW_UP_DRAFT"].includes(i.status));
  const waiting = inquiries.filter((i) => i.status === "SENT");
  const needsAction = inquiries.filter((i) => ["FOLLOW_UP_NEEDED", "RESPONSE_RECEIVED", "ESCALATED"].includes(i.status));
  const resolved = inquiries.filter((i) => ["RESOLVED", "CANCELLED"].includes(i.status));

  const selected = selectedId ? inquiries.find((i) => i.id === selectedId) : null;

  const daysAgo = (date: string | null) => {
    if (!date) return null;
    const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
  };

  const daysUntil = (date: string | null) => {
    if (!date) return null;
    const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return d <= 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`;
  };

  const renderCard = (inquiry: Inquiry) => {
    const cfg = STATUS_CONFIG[inquiry.status] ?? STATUS_CONFIG.DRAFT;
    const Icon = cfg.icon;
    const isDraft = ["DRAFT", "FOLLOW_UP_DRAFT"].includes(inquiry.status);
    const amount = inquiry.bankTransaction?.amount ?? inquiry.invoice?.totalAmount;

    return (
      <div
        key={inquiry.id}
        className={`border border-border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedId === inquiry.id ? "ring-2 ring-accent" : ""}`}
        onClick={() => setSelectedId(inquiry.id === selectedId ? null : inquiry.id)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${cfg.bg}`}>
              <Icon size={16} className={cfg.color} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{TRIGGER_LABELS[inquiry.triggerType] ?? inquiry.triggerType}</span>
                <span className="text-text-tertiary text-xs">—</span>
                <span className="text-sm">{inquiry.contact?.name ?? inquiry.recipientName}</span>
                {amount != null && (
                  <span className="font-mono text-xs text-text-secondary">{Math.abs(amount).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</span>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{inquiry.subject}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                {inquiry.sentAt && <span className="text-[10px] text-text-tertiary">Enviado {daysAgo(inquiry.sentAt)}</span>}
                {inquiry.status === "SENT" && inquiry.nextFollowUpDate && (
                  <span className="text-[10px] text-text-tertiary">Follow-up {daysUntil(inquiry.nextFollowUpDate)}</span>
                )}
                {inquiry.followUpNumber > 0 && (
                  <span className="text-[10px] text-text-tertiary">Follow-up #{inquiry.followUpNumber}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedId(inquiry.id); }}
                  className="text-xs text-accent hover:underline"
                >Ver borrador</button>
                <button
                  onClick={(e) => { e.stopPropagation(); approveInquiry(inquiry.id); }}
                  disabled={acting}
                  className="text-xs bg-accent text-white px-3 py-1 rounded hover:bg-accent/90 disabled:opacity-50"
                >Aprobar y enviar</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-8 text-text-secondary">Cargando seguimientos...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Seguimientos</h1>
          <p className="text-sm text-text-secondary mt-1">
            Consultas enviadas por email a contactos para solicitar documentación.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: "all", label: "Todos", count: inquiries.length },
          { key: "DRAFT", label: "Pendientes de aprobar", count: drafts.length },
          { key: "SENT", label: "Esperando respuesta", count: waiting.length },
          { key: "FOLLOW_UP_NEEDED", label: "Necesitan follow-up", count: needsAction.length },
          { key: "RESOLVED", label: "Resueltos", count: resolved.length },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key === filter ? "all" : f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key ? "bg-accent text-white border-accent" : "bg-white border-border text-text-secondary hover:border-accent"
            }`}
          >
            {f.label} {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
          </button>
        ))}
      </div>

      {/* Grouped sections */}
      <div className="space-y-6">
        {drafts.length > 0 && (filter === "all" || filter === "DRAFT") && (
          <div>
            <h2 className="text-sm font-semibold text-text-secondary mb-3">PENDIENTES DE APROBAR ({drafts.length})</h2>
            <div className="space-y-2">{drafts.map(renderCard)}</div>
          </div>
        )}

        {waiting.length > 0 && (filter === "all" || filter === "SENT") && (
          <div>
            <h2 className="text-sm font-semibold text-text-secondary mb-3">ESPERANDO RESPUESTA ({waiting.length})</h2>
            <div className="space-y-2">{waiting.map(renderCard)}</div>
          </div>
        )}

        {needsAction.length > 0 && (filter === "all" || filter === "FOLLOW_UP_NEEDED") && (
          <div>
            <h2 className="text-sm font-semibold text-text-secondary mb-3">NECESITAN ACCIÓN ({needsAction.length})</h2>
            <div className="space-y-2">{needsAction.map(renderCard)}</div>
          </div>
        )}

        {resolved.length > 0 && (filter === "all" || filter === "RESOLVED") && (
          <div>
            <h2 className="text-sm font-semibold text-text-secondary mb-3">RESUELTOS ({resolved.length})</h2>
            <div className="space-y-2">{resolved.map(renderCard)}</div>
          </div>
        )}

        {inquiries.length === 0 && (
          <div className="text-center py-12 text-text-tertiary">
            <Mail size={32} className="mx-auto mb-3 opacity-30" />
            <p>No hay seguimientos activos</p>
            <p className="text-xs mt-1">Genera una consulta desde la bandeja de conciliación</p>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 overflow-y-auto" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 mb-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">{TRIGGER_LABELS[selected.triggerType]}</h2>
              <button onClick={() => setSelectedId(null)} className="text-text-tertiary hover:text-text-primary">✕</button>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Context */}
              {selected.bankTransaction && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-text-tertiary mb-1">Movimiento bancario</p>
                  <p className="text-sm font-mono">{Math.abs(selected.bankTransaction.amount).toFixed(2)} EUR — {selected.bankTransaction.concept}</p>
                  <p className="text-xs text-text-secondary">{new Date(selected.bankTransaction.valueDate).toLocaleDateString("es-ES")}</p>
                </div>
              )}

              {/* Email preview */}
              <div>
                <p className="text-xs text-text-tertiary mb-1">Para: {selected.recipientEmail}</p>
                <p className="text-sm font-medium mb-2">{selected.subject}</p>
                <div className="border border-border rounded-lg p-4 text-sm" dangerouslySetInnerHTML={{ __html: selected.body }} />
              </div>

              {/* Agent evaluation */}
              {selected.proposedAction && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-border">
                    <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-accent/10 rounded flex items-center justify-center text-[10px]">AI</span>
                      Evaluación del agente
                    </span>
                    {selected.responseConfidence != null && (
                      <span className="text-[10px] text-text-tertiary">
                        Confianza: {Math.round(selected.responseConfidence * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {/* Response summary */}
                    {selected.responseSummary && (
                      <p className="text-sm">{selected.responseSummary}</p>
                    )}

                    {/* Document validation */}
                    {selected.documentValidation && (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <p className="text-[10px] font-semibold text-text-tertiary uppercase">Validación del documento</p>
                        {[
                          { label: "Importe", value: selected.documentValidation.amountMatch, check: selected.documentValidation.amountMatch === "exact" || selected.documentValidation.amountMatch === "close" },
                          { label: "Fecha", value: selected.documentValidation.dateMatch, check: selected.documentValidation.dateMatch === "exact" || selected.documentValidation.dateMatch === "close" },
                          { label: "Emisor", value: selected.documentValidation.contactMatch ? "coincide" : "no coincide", check: selected.documentValidation.contactMatch },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2 text-xs">
                            <span className={item.check ? "text-green-600" : "text-red-500"}>{item.check ? "✅" : "❌"}</span>
                            <span className="text-text-secondary">{item.label}:</span>
                            <span className="font-medium">{item.value}</span>
                          </div>
                        ))}
                        {selected.documentValidation.invoiceNumberFound && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-blue-500">📄</span>
                            <span className="text-text-secondary">Nº factura:</span>
                            <span className="font-mono font-medium">{selected.documentValidation.invoiceNumberFound}</span>
                          </div>
                        )}
                        {(selected.documentValidation.issues?.length ?? 0) > 0 && (
                          <div className="mt-2 space-y-1">
                            {selected.documentValidation.issues!.map((issue, i) => (
                              <p key={i} className="text-xs text-red-600">- {issue}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Proposed action */}
                    <div className="border-t border-border pt-3">
                      <p className="text-xs text-text-tertiary mb-1">Propuesta</p>
                      <p className="text-sm font-medium">{selected.proposedActionReason}</p>
                    </div>

                    {/* Proposed follow-up body preview */}
                    {selected.proposedFollowUpBody && ["FOLLOW_UP_NEEDED", "RESPONSE_RECEIVED"].includes(selected.status) && (
                      <div className="border border-border rounded-lg p-3">
                        <p className="text-[10px] text-text-tertiary mb-2">Borrador de respuesta preparado</p>
                        <div className="text-xs text-text-secondary line-clamp-4" dangerouslySetInnerHTML={{ __html: selected.proposedFollowUpBody }} />
                      </div>
                    )}

                    {/* Escalation decision options */}
                    {selected.status === "ESCALATED" && (
                      <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-700">Requiere tu decisión</p>
                        <div className="space-y-1.5">
                          <button onClick={() => { /* TODO: accept explanation */ }} className="w-full text-left text-xs px-3 py-2 rounded border border-border hover:bg-white">
                            Aceptar la explicación y cerrar
                          </button>
                          <button onClick={() => { /* TODO: reply manually */ }} className="w-full text-left text-xs px-3 py-2 rounded border border-border hover:bg-white">
                            Responder pidiendo más detalles
                          </button>
                          <button onClick={() => { /* TODO: classify manually */ }} className="w-full text-left text-xs px-3 py-2 rounded border border-border hover:bg-white">
                            Clasificar el movimiento manualmente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Simple response summary (fallback for inquiries without full evaluation) */}
              {!selected.proposedAction && selected.responseSummary && (
                <div className={`rounded-lg p-3 ${selected.responseResolved ? "bg-green-50" : "bg-amber-50"}`}>
                  <p className="text-xs font-medium mb-1">{selected.responseResolved ? "✅ Respuesta satisfactoria" : "⚠️ Respuesta parcial"}</p>
                  <p className="text-sm">{selected.responseSummary}</p>
                  {selected.attachmentsReceived > 0 && (
                    <p className="text-xs text-text-secondary mt-1">{selected.attachmentsReceived} adjunto(s) recibido(s)</p>
                  )}
                </div>
              )}

              {/* Follow-up chain */}
              {selected.followUps.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary mb-2">Cadena de follow-ups</p>
                  {selected.followUps.map((fu) => {
                    const cfg = STATUS_CONFIG[fu.status] ?? STATUS_CONFIG.DRAFT;
                    return (
                      <div key={fu.id} className="flex items-center gap-2 text-xs py-1">
                        <span className={`px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>#{fu.followUpNumber}</span>
                        <span>{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              {["DRAFT", "FOLLOW_UP_DRAFT"].includes(selected.status) && (
                <>
                  <button
                    onClick={() => { rejectInquiry(selected.id); setSelectedId(null); }}
                    className="text-xs text-red-600 hover:text-red-800 px-3 py-2"
                  >Cancelar</button>
                  <button
                    onClick={() => { approveInquiry(selected.id); setSelectedId(null); }}
                    disabled={acting}
                    className="text-xs bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50"
                  >Aprobar y enviar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
