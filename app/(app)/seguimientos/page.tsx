"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import {
  Mail,
  Send,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RotateCw,
  FileText,
  MessageSquare,
  Bot,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatAmount } from "@/lib/format";
import { api } from "@/lib/api-client";

// ── AgentThread types ──

interface ThreadMessage {
  id: string;
  role: "AGENT" | "CONTROLLER" | "EXTERNAL" | "SYSTEM";
  channel: "APP" | "EMAIL";
  content: string;
  contentHtml?: string;
  suggestedActions?: Array<{ type: string; label: string }>;
  actionTaken?: string;
  createdAt: string;
}

interface AgentThread {
  id: string;
  scenario: string;
  status: string;
  priority: string;
  subject: string;
  summary?: string;
  blockedReason?: string;
  followUpCount: number;
  nextFollowUpAt?: string;
  lastActivityAt: string;
  externalName?: string;
  autoResolved: boolean;
  resolvedAt?: string;
  dueDate?: string;
  messages: ThreadMessage[];
}

// ── Legacy Inquiry types ──

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

// ── Constants ──

const SCENARIO_LABELS: Record<string, string> = {
  OVERDUE_RECEIVABLE: "Cobro pendiente",
  DUPLICATE_OR_OVERPAYMENT: "Duplicado/Sobrepago",
  SUPPLIER_DISCREPANCY: "Discrepancia proveedor",
  MISSING_FISCAL_DOCS: "Docs. fiscales faltantes",
  GESTORIA_RECONCILIATION: "Conciliación gestoría",
  BANK_RETURN: "Devolución bancaria",
  UNIDENTIFIED_ADVANCE: "Anticipo no identificado",
  INTERCOMPANY: "Intercompañía",
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: "Crítico", color: "text-red-700", bg: "bg-red-100" },
  HIGH: { label: "Alto", color: "text-orange-700", bg: "bg-orange-100" },
  MEDIUM: { label: "Medio", color: "text-blue-700", bg: "bg-blue-100" },
  LOW: { label: "Bajo", color: "text-gray-600", bg: "bg-gray-100" },
};

const THREAD_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  AGENT_WORKING: { label: "Agente trabajando", color: "text-blue-600", bg: "bg-blue-50" },
  WAITING_EXTERNAL: { label: "Esperando respuesta", color: "text-amber-600", bg: "bg-amber-50" },
  WAITING_CONTROLLER: { label: "Tu decisión", color: "text-purple-600", bg: "bg-purple-50" },
  RESOLVED: { label: "Resuelto", color: "text-green-600", bg: "bg-green-50" },
  STALE: { label: "Estancado", color: "text-gray-500", bg: "bg-gray-50" },
};

const INQUIRY_STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Mail; color: string; bg: string }
> = {
  DRAFT: { label: "Borrador", icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
  FOLLOW_UP_DRAFT: {
    label: "Follow-up preparado",
    icon: RotateCw,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  SENT: { label: "Enviado", icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
  RESPONSE_RECEIVED: {
    label: "Respuesta recibida",
    icon: Mail,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  RESOLVED: { label: "Resuelto", icon: CheckCircle, color: "text-green-700", bg: "bg-green-50" },
  FOLLOW_UP_NEEDED: {
    label: "Necesita follow-up",
    icon: RotateCw,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
  ESCALATED: { label: "Escalado", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  CANCELLED: { label: "Cancelado", icon: XCircle, color: "text-gray-500", bg: "bg-gray-50" },
};

const TRIGGER_LABELS: Record<string, string> = {
  MISSING_INVOICE: "Factura faltante",
  MISSING_DOCUMENTATION: "Documentación pendiente",
  EXPENSE_CLARIFICATION: "Aclaración de gasto",
  IC_CONFIRMATION: "Confirmación IC",
};

// ── Helpers ──

function daysAgo(date: string | null | undefined) {
  if (!date) return null;
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`;
}

const ROLE_LABELS: Record<string, string> = {
  AGENT: "Agente",
  CONTROLLER: "Tú",
  EXTERNAL: "Contacto",
  SYSTEM: "Sistema",
};

const ROLE_COLORS: Record<string, string> = {
  AGENT: "bg-blue-100 text-blue-700",
  CONTROLLER: "bg-purple-100 text-purple-700",
  EXTERNAL: "bg-amber-100 text-amber-700",
  SYSTEM: "bg-gray-100 text-gray-500",
};

// ── Main Component ──

export default function SeguimientosPage() {
  const [threadFilter, setThreadFilter] = useState<string>("active");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacyFilter, setLegacyFilter] = useState("all");
  const [acting, setActing] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch threads
  const threadApiPath =
    threadFilter === "active"
      ? "/api/threads?status=WAITING_CONTROLLER&pageSize=50"
      : threadFilter === "working"
        ? "/api/threads?pageSize=50"
        : threadFilter === "resolved"
          ? "/api/threads?status=RESOLVED&pageSize=25"
          : "/api/threads?pageSize=50";

  const { data: threadData, refetch: refetchThreads } = useFetch<{
    data: AgentThread[];
    pagination: { total: number };
  }>(threadApiPath, [threadFilter]);
  const threads = threadData?.data ?? [];

  // Fetch selected thread detail
  const { data: threadDetail, refetch: refetchDetail } = useFetch<{ data: AgentThread }>(
    selectedThreadId ? `/api/threads/${selectedThreadId}` : null,
    [selectedThreadId]
  );
  const selectedThread = threadDetail?.data;

  // Fetch thread stats
  const { data: statsData } = useFetch<{
    data: { total: number; byStatus: Record<string, number> };
  }>("/api/threads/stats", []);
  const stats = statsData?.data;

  // Legacy inquiries
  const legacyApiPath = `/api/inquiries${legacyFilter !== "all" ? `?status=${legacyFilter}` : ""}`;
  const {
    data: inquiryData,
    loading: inquiryLoading,
    refetch: refetchInquiries,
  } = useFetch<{
    data: Inquiry[];
    pagination: { total: number };
  }>(showLegacy ? legacyApiPath : null, [legacyFilter, showLegacy]);
  const inquiries = inquiryData?.data ?? [];

  // Group threads
  const waitingController = threads.filter((t) => t.status === "WAITING_CONTROLLER");
  const agentWorking = threads.filter((t) =>
    ["AGENT_WORKING", "WAITING_EXTERNAL"].includes(t.status)
  );
  const resolved = threads.filter((t) => t.status === "RESOLVED");

  // Search filter
  const filterBySearch = <T extends { subject?: string; externalName?: string }>(items: T[]) =>
    search
      ? items.filter(
          (i) =>
            (i.subject ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (i.externalName ?? "").toLowerCase().includes(search.toLowerCase())
        )
      : items;

  // Chat handler
  const sendChat = async () => {
    if (!selectedThreadId || !chatInput.trim()) return;
    setChatSending(true);
    try {
      await api.post(`/api/threads/${selectedThreadId}/messages`, { message: chatInput });
      setChatInput("");
      refetchDetail();
      refetchThreads();
    } catch {
      /* ignore */
    }
    setChatSending(false);
  };

  // Action handler
  const takeAction = async (threadId: string, action: string) => {
    setActing(true);
    try {
      await api.post(`/api/threads/${threadId}/messages`, { message: action, actionTaken: action });
      refetchThreads();
      refetchDetail();
    } catch {
      /* ignore */
    }
    setActing(false);
  };

  const resolveThread = async (threadId: string) => {
    setActing(true);
    try {
      await api.post(`/api/threads/${threadId}/resolve`);
      refetchThreads();
      setSelectedThreadId(null);
    } catch {
      /* ignore */
    }
    setActing(false);
  };

  // Legacy inquiry actions
  const approveInquiry = async (id: string) => {
    setActing(true);
    try {
      await api.post(`/api/inquiries/${id}/approve`);
      refetchInquiries();
    } catch {
      /* ignore */
    }
    setActing(false);
  };

  // ── Render thread card ──
  const renderThreadCard = (thread: AgentThread) => {
    const statusCfg = THREAD_STATUS_CONFIG[thread.status] ?? THREAD_STATUS_CONFIG.AGENT_WORKING;
    const priorityCfg = PRIORITY_CONFIG[thread.priority] ?? PRIORITY_CONFIG.MEDIUM;
    const lastMsg = thread.messages?.[0];

    return (
      <div
        key={thread.id}
        className={`border border-border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
          selectedThreadId === thread.id ? "ring-2 ring-accent" : ""
        }`}
        onClick={() => setSelectedThreadId(thread.id === selectedThreadId ? null : thread.id)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${statusCfg.bg}`}>
              {thread.status === "WAITING_CONTROLLER" ? (
                <AlertTriangle size={16} className={statusCfg.color} />
              ) : thread.status === "RESOLVED" ? (
                <CheckCircle size={16} className={statusCfg.color} />
              ) : (
                <Bot size={16} className={statusCfg.color} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate max-w-xs">{thread.subject}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${priorityCfg.bg} ${priorityCfg.color}`}
                >
                  {priorityCfg.label}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}
                >
                  {statusCfg.label}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {SCENARIO_LABELS[thread.scenario] ?? thread.scenario}
                </span>
                {thread.followUpCount > 0 && (
                  <span className="text-[10px] text-text-tertiary">
                    {thread.followUpCount} follow-up{thread.followUpCount > 1 ? "s" : ""}
                  </span>
                )}
                {thread.nextFollowUpAt && thread.status !== "RESOLVED" && (
                  <span className="text-[10px] text-text-tertiary flex items-center gap-0.5">
                    <Clock size={10} />
                    {daysUntil(thread.nextFollowUpAt)}
                  </span>
                )}
                {thread.resolvedAt && (
                  <span className="text-[10px] text-text-tertiary">
                    {thread.autoResolved ? "Auto-resuelto" : "Resuelto"}{" "}
                    {daysAgo(thread.resolvedAt)}
                  </span>
                )}
              </div>
              {thread.blockedReason && thread.status === "WAITING_CONTROLLER" && (
                <p className="text-xs text-amber-700 mt-1 line-clamp-2">{thread.blockedReason}</p>
              )}
              {lastMsg && (
                <p className="text-xs text-text-secondary mt-1 line-clamp-1">
                  {ROLE_LABELS[lastMsg.role] ?? lastMsg.role}: {lastMsg.content.substring(0, 120)}
                </p>
              )}
            </div>
          </div>

          {/* Quick actions for WAITING_CONTROLLER */}
          {thread.status === "WAITING_CONTROLLER" && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resolveThread(thread.id);
                }}
                disabled={acting}
                className="text-xs text-green-700 hover:text-green-900 px-2 py-1 border border-green-200 rounded disabled:opacity-50"
              >
                Resolver
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render legacy inquiry card ──
  const renderInquiryCard = (inquiry: Inquiry) => {
    const cfg = INQUIRY_STATUS_CONFIG[inquiry.status] ?? INQUIRY_STATUS_CONFIG.DRAFT;
    const Icon = cfg.icon;
    const isDraft = ["DRAFT", "FOLLOW_UP_DRAFT"].includes(inquiry.status);
    const amount = inquiry.bankTransaction?.amount ?? inquiry.invoice?.totalAmount;

    return (
      <div key={inquiry.id} className="border border-border rounded-lg p-4 hover:bg-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${cfg.bg}`}>
              <Icon size={16} className={cfg.color} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {TRIGGER_LABELS[inquiry.triggerType] ?? inquiry.triggerType}
                </span>
                <span className="text-text-tertiary text-xs">--</span>
                <span className="text-sm">{inquiry.contact?.name ?? inquiry.recipientName}</span>
                {amount != null && (
                  <span className="font-mono text-xs text-text-secondary">
                    {formatAmount(Math.abs(amount))}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{inquiry.subject}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
                {inquiry.sentAt && (
                  <span className="text-[10px] text-text-tertiary">
                    Enviado {daysAgo(inquiry.sentAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          {isDraft && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveInquiry(inquiry.id)}
                disabled={acting}
                className="text-xs bg-accent text-white px-3 py-1 rounded hover:bg-accent/90 disabled:opacity-50"
              >
                Aprobar y enviar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Centro de Seguimientos</h1>
          <p className="text-sm text-text-secondary mt-1">
            El agente gestiona seguimientos de forma autónoma. Intervén cuando te lo pida.
          </p>
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-purple-600 font-medium">
              {stats.byStatus?.WAITING_CONTROLLER ?? 0} pendientes
            </span>
            <span className="text-blue-600">
              {(stats.byStatus?.AGENT_WORKING ?? 0) + (stats.byStatus?.WAITING_EXTERNAL ?? 0)}{" "}
              activos
            </span>
            <span className="text-green-600">{stats.byStatus?.RESOLVED ?? 0} resueltos</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por asunto o contacto..."
          className="w-full max-w-sm border border-border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Thread filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          {
            key: "active",
            label: "Requieren tu decisión",
            count: stats?.byStatus?.WAITING_CONTROLLER ?? 0,
          },
          { key: "working", label: "Todos activos", count: stats?.total ?? 0 },
          { key: "resolved", label: "Resueltos", count: stats?.byStatus?.RESOLVED ?? 0 },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setThreadFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              threadFilter === f.key
                ? "bg-accent text-white border-accent"
                : "bg-white border-border text-text-secondary hover:border-accent"
            }`}
          >
            {f.label} {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
          </button>
        ))}
      </div>

      {/* ── Section 1: Waiting Controller ── */}
      {(threadFilter === "active" || threadFilter === "working") &&
        filterBySearch(waitingController).length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              REQUIEREN TU DECISIÓN ({filterBySearch(waitingController).length})
            </h2>
            <div className="space-y-2">
              {filterBySearch(waitingController).map(renderThreadCard)}
            </div>
          </div>
        )}

      {/* ── Section 2: Agent Working ── */}
      {threadFilter === "working" && filterBySearch(agentWorking).length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            EL AGENTE ESTÁ GESTIONANDO ({filterBySearch(agentWorking).length})
          </h2>
          <div className="space-y-2">{filterBySearch(agentWorking).map(renderThreadCard)}</div>
        </div>
      )}

      {/* ── Section 3: Resolved ── */}
      {threadFilter === "resolved" && filterBySearch(resolved).length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            RESUELTOS RECIENTEMENTE ({filterBySearch(resolved).length})
          </h2>
          <div className="space-y-2">{filterBySearch(resolved).map(renderThreadCard)}</div>
        </div>
      )}

      {threads.length === 0 && (
        <div className="text-center py-12 text-text-tertiary">
          <Bot size={32} className="mx-auto mb-3 opacity-30" />
          <p>No hay seguimientos activos</p>
          <p className="text-xs mt-1">
            El agente creará hilos automáticamente durante el ciclo diario
          </p>
        </div>
      )}

      {/* ── Thread Detail Modal ── */}
      {selectedThread && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto"
          onClick={() => setSelectedThreadId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 mb-16 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">{selectedThread.subject}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${THREAD_STATUS_CONFIG[selectedThread.status]?.bg} ${THREAD_STATUS_CONFIG[selectedThread.status]?.color}`}
                  >
                    {THREAD_STATUS_CONFIG[selectedThread.status]?.label}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {SCENARIO_LABELS[selectedThread.scenario]}
                  </span>
                  {selectedThread.externalName && (
                    <span className="text-[10px] text-text-tertiary">
                      {selectedThread.externalName}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedThreadId(null)}
                className="text-text-tertiary hover:text-text-primary text-lg"
              >
                x
              </button>
            </div>

            {/* Messages timeline */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {selectedThread.summary && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-[10px] text-text-tertiary uppercase mb-1">Resumen</p>
                  <p className="text-sm">{selectedThread.summary}</p>
                </div>
              )}

              {selectedThread.messages?.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div
                    className={`text-[10px] px-1.5 py-0.5 rounded h-fit whitespace-nowrap ${ROLE_COLORS[msg.role] ?? "bg-gray-100"}`}
                  >
                    {ROLE_LABELS[msg.role] ?? msg.role}
                  </div>
                  <div className="flex-1 min-w-0">
                    {msg.contentHtml ? (
                      <div
                        className="text-sm border border-border rounded-lg p-3"
                        dangerouslySetInnerHTML={{ __html: msg.contentHtml }}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.suggestedActions && Array.isArray(msg.suggestedActions) && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {(msg.suggestedActions as Array<{ type: string; label: string }>).map(
                          (action, i) => (
                            <button
                              key={i}
                              onClick={() => takeAction(selectedThread.id, action.type)}
                              disabled={acting}
                              className="text-xs px-3 py-1 border border-accent text-accent rounded hover:bg-accent/10 disabled:opacity-50"
                            >
                              {action.label}
                            </button>
                          )
                        )}
                      </div>
                    )}
                    {msg.actionTaken && (
                      <span className="text-[10px] text-green-600 mt-1 inline-block">
                        Acción: {msg.actionTaken}
                      </span>
                    )}
                    <p className="text-[10px] text-text-tertiary mt-1">
                      {new Date(msg.createdAt).toLocaleString("es-ES")}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions + Chat */}
            <div className="border-t border-border px-6 py-4 flex-shrink-0 space-y-3">
              {selectedThread.status === "WAITING_CONTROLLER" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveThread(selectedThread.id)}
                    disabled={acting}
                    className="text-xs bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Resolver
                  </button>
                  <button
                    onClick={() => takeAction(selectedThread.id, "extend_followup")}
                    disabled={acting}
                    className="text-xs border border-border px-4 py-2 rounded-lg hover:bg-hover disabled:opacity-50"
                  >
                    Enviar 1 más
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                  placeholder="Escribe una instrucción al agente..."
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
                  disabled={chatSending}
                />
                <button
                  onClick={sendChat}
                  disabled={chatSending || !chatInput.trim()}
                  className="text-xs bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50"
                >
                  <MessageSquare size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Legacy Inquiries (collapsible) ── */}
      <div className="mt-8 border-t border-border pt-6">
        <button
          onClick={() => setShowLegacy(!showLegacy)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          {showLegacy ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Consultas por email (sistema anterior)
          {(inquiryData?.pagination?.total ?? 0) > 0 && (
            <span className="text-xs text-text-tertiary">({inquiryData?.pagination?.total})</span>
          )}
        </button>

        {showLegacy && (
          <div className="mt-4">
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { key: "all", label: "Todos" },
                { key: "DRAFT", label: "Pendientes de aprobar" },
                { key: "SENT", label: "Esperando respuesta" },
                { key: "RESOLVED", label: "Resueltos" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setLegacyFilter(f.key === legacyFilter ? "all" : f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    legacyFilter === f.key
                      ? "bg-accent text-white border-accent"
                      : "bg-white border-border text-text-secondary hover:border-accent"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {inquiryLoading ? (
              <p className="text-text-tertiary text-sm">Cargando...</p>
            ) : inquiries.length === 0 ? (
              <p className="text-text-tertiary text-sm py-4">No hay consultas en este filtro.</p>
            ) : (
              <div className="space-y-2">{inquiries.map(renderInquiryCard)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
