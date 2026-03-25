"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useApi";
import { Bot, ChevronDown, ChevronUp, Send, Search } from "lucide-react";
import { formatAmount } from "@/lib/format";
import { api } from "@/lib/api-client";

// ── Types ──

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

interface Inquiry {
  id: string;
  triggerType: string;
  status: string;
  subject: string;
  recipientName: string;
  sentAt: string | null;
  contact: { id: string; name: string } | null;
  bankTransaction: { id: string; amount: number; concept: string; valueDate: string } | null;
  invoice: { id: string; number: string; totalAmount: number } | null;
}

// ── Constants ──

const SCENARIO_LABELS: Record<string, string> = {
  OVERDUE_RECEIVABLE: "Cobro pendiente",
  DUPLICATE_OR_OVERPAYMENT: "Cobro duplicado",
  SUPPLIER_DISCREPANCY: "Discrepancia proveedor",
  MISSING_FISCAL_DOCS: "Doc. fiscal faltante",
  GESTORIA_RECONCILIATION: "Gestoría",
  BANK_RETURN: "Devolución bancaria",
  UNIDENTIFIED_ADVANCE: "Anticipo sin identificar",
  INTERCOMPANY: "Intercompañía",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-l-4 border-l-red-500 bg-red-50/50",
  HIGH: "border-l-4 border-l-amber-500 bg-amber-50/30",
  MEDIUM: "border-l-4 border-l-blue-400",
  LOW: "border-l-4 border-l-gray-300",
};

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: "Crítico", className: "bg-red-100 text-red-700" },
  HIGH: { label: "Alto", className: "bg-amber-100 text-amber-700" },
  MEDIUM: { label: "Medio", className: "bg-blue-100 text-blue-700" },
  LOW: { label: "Bajo", className: "bg-gray-100 text-gray-600" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  AGENT_WORKING: { label: "Agente trabajando", color: "text-blue-600" },
  WAITING_EXTERNAL: { label: "Esperando respuesta", color: "text-amber-600" },
  WAITING_CONTROLLER: { label: "Requiere decisión", color: "text-red-600" },
  RESOLVED: { label: "Resuelto", color: "text-green-600" },
  STALE: { label: "Sin actividad", color: "text-gray-500" },
};

const ROLE_STYLES: Record<string, { label: string; bg: string }> = {
  SYSTEM: { label: "Sistema", bg: "bg-gray-50" },
  AGENT: { label: "Agente", bg: "bg-blue-50" },
  EXTERNAL: { label: "Respuesta externa", bg: "bg-amber-50" },
  CONTROLLER: { label: "Tú", bg: "bg-green-50" },
};

const TRIGGER_LABELS: Record<string, string> = {
  MISSING_INVOICE: "Factura faltante",
  MISSING_DOCUMENTATION: "Documentación pendiente",
  EXPENSE_CLARIFICATION: "Aclaración de gasto",
  IC_CONFIRMATION: "Confirmación IC",
};

type FilterKey = "all" | "decision" | "active" | "resolved";

// ── Helpers ──

function daysAgoLabel(date: string): string {
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  return `${d}d`;
}

function daysAgo(date: string | null | undefined) {
  if (!date) return null;
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

// ── ThreadCard ──

function ThreadCard({
  thread,
  selected,
  onClick,
}: {
  thread: AgentThread;
  selected: boolean;
  onClick: () => void;
}) {
  const lastMsg = thread.messages?.[0];
  const statusCfg = STATUS_CONFIG[thread.status] ?? STATUS_CONFIG.AGENT_WORKING;
  const priorityColor = PRIORITY_COLORS[thread.priority] ?? PRIORITY_COLORS.LOW;

  return (
    <div
      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selected ? "bg-blue-50/60" : ""} ${priorityColor}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">
            {SCENARIO_LABELS[thread.scenario] ?? thread.scenario}
          </span>
          <p className="font-medium text-sm text-gray-900 truncate">{thread.subject}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {thread.summary ?? lastMsg?.content?.slice(0, 80) ?? ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-[10px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
          <p className="text-[10px] text-gray-400 mt-0.5">{daysAgoLabel(thread.lastActivityAt)}</p>
        </div>
      </div>
      {thread.followUpCount > 0 && (
        <p className="text-[10px] text-gray-400 mt-1">
          {thread.followUpCount} follow-up{thread.followUpCount > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ── ThreadDetailPanel ──

function ThreadDetailPanel({
  thread,
  onAction,
  onChat,
  onResolve,
  acting,
}: {
  thread: AgentThread;
  onAction: (threadId: string, action: string) => void;
  onChat: (threadId: string, message: string) => void;
  onResolve: (threadId: string) => void;
  acting: boolean;
}) {
  const [chatInput, setChatInput] = useState("");
  const priorityCfg = PRIORITY_BADGE[thread.priority] ?? PRIORITY_BADGE.MEDIUM;

  const handleSend = () => {
    if (!chatInput.trim()) return;
    onChat(thread.id, chatInput);
    setChatInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityCfg.className}`}
          >
            {priorityCfg.label}
          </span>
          <span className="text-xs text-gray-500">
            {SCENARIO_LABELS[thread.scenario] ?? thread.scenario}
          </span>
          {thread.externalName && (
            <span className="text-xs text-gray-400">— {thread.externalName}</span>
          )}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{thread.subject}</h2>
        {thread.blockedReason && (
          <p className="text-sm text-amber-700 mt-2 bg-amber-50 px-3 py-1.5 rounded">
            {thread.blockedReason}
          </p>
        )}
        {thread.summary && (
          <p className="text-sm text-gray-600 mt-2 bg-gray-50 px-3 py-2 rounded">
            {thread.summary}
          </p>
        )}
      </div>

      {/* Messages timeline */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {thread.messages?.map((msg) => {
          const style = ROLE_STYLES[msg.role] ?? ROLE_STYLES.SYSTEM;
          return (
            <div key={msg.id} className={`p-3 rounded-lg text-sm ${style.bg}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-medium text-xs text-gray-700">{style.label}</span>
                <span className="text-[10px] text-gray-400 ml-auto">
                  {new Date(msg.createdAt).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {msg.contentHtml ? (
                <div
                  className="text-gray-800 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: msg.contentHtml }}
                />
              ) : (
                <p className="text-gray-800 whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.suggestedActions && Array.isArray(msg.suggestedActions) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(msg.suggestedActions as Array<{ type: string; label: string }>).map(
                    (action, i) => (
                      <button
                        key={i}
                        onClick={() => onAction(thread.id, action.type)}
                        disabled={acting}
                        className="px-3 py-1 text-xs font-medium rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
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
            </div>
          );
        })}
      </div>

      {/* Actions bar (if WAITING_CONTROLLER) */}
      {thread.status === "WAITING_CONTROLLER" && (
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              onClick={() => onResolve(thread.id)}
              disabled={acting}
            >
              Resolver
            </button>
            <button
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              onClick={() => onAction(thread.id, "extend_followup")}
              disabled={acting}
            >
              Enviar 1 más
            </button>
            <button
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
              onClick={() => onResolve(thread.id)}
              disabled={acting}
            >
              Cerrar sin acción
            </button>
          </div>
        </div>
      )}

      {/* Chat input */}
      <div className="px-5 py-3 border-t border-gray-200 flex-shrink-0">
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Escribe una instrucción al agente..."
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EmptyDetailState ──

function EmptyDetailState() {
  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        <Bot size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Selecciona un seguimiento para ver los detalles</p>
      </div>
    </div>
  );
}

// ── FilterButton ──

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white border-gray-200 text-gray-600 hover:border-blue-400"
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1 opacity-80">({count})</span>}
    </button>
  );
}

// ── LegacyInquiriesSection ──

function LegacyInquiriesSection() {
  const [show, setShow] = useState(false);
  const [legacyFilter, setLegacyFilter] = useState("all");

  const legacyApiPath = `/api/inquiries${legacyFilter !== "all" ? `?status=${legacyFilter}` : ""}`;
  const { data: inquiryData, loading: inquiryLoading } = useFetch<{
    data: Inquiry[];
    pagination: { total: number };
  }>(show ? legacyApiPath : null, [legacyFilter, show]);
  const inquiries = inquiryData?.data ?? [];

  return (
    <div className="border-t border-gray-200 mt-2">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-2 px-4 py-3 text-xs text-gray-500 hover:text-gray-700 w-full"
      >
        {show ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Consultas por email (sistema anterior)
        {(inquiryData?.pagination?.total ?? 0) > 0 && (
          <span className="text-gray-400">({inquiryData?.pagination?.total})</span>
        )}
      </button>
      {show && (
        <div className="px-4 pb-4">
          <div className="flex gap-2 mb-3 flex-wrap">
            {[
              { key: "all", label: "Todos" },
              { key: "DRAFT", label: "Pendientes" },
              { key: "SENT", label: "Enviados" },
              { key: "RESOLVED", label: "Resueltos" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setLegacyFilter(f.key)}
                className={`text-[10px] px-2 py-1 rounded border ${
                  legacyFilter === f.key
                    ? "bg-gray-800 text-white border-gray-800"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {inquiryLoading ? (
            <p className="text-gray-400 text-xs py-3">Cargando...</p>
          ) : inquiries.length === 0 ? (
            <p className="text-gray-400 text-xs py-3">No hay consultas en este filtro.</p>
          ) : (
            <div className="space-y-1">
              {inquiries.map((inq) => {
                const amount = inq.bankTransaction?.amount ?? inq.invoice?.totalAmount;
                return (
                  <div
                    key={inq.id}
                    className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="text-gray-500">
                        {TRIGGER_LABELS[inq.triggerType] ?? inq.triggerType}
                      </span>
                      <span className="mx-1.5 text-gray-300">—</span>
                      <span className="text-gray-700">
                        {inq.contact?.name ?? inq.recipientName}
                      </span>
                      {amount != null && (
                        <span className="ml-2 font-mono text-gray-500">
                          {formatAmount(Math.abs(amount))}
                        </span>
                      )}
                    </div>
                    {inq.sentAt && (
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {daysAgo(inq.sentAt)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function SeguimientosPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState(false);

  // Fetch ALL threads (no status filter — client filters)
  const {
    data: threadData,
    loading,
    refetch,
  } = useFetch<{
    data: AgentThread[];
    pagination: { total: number };
  }>("/api/threads?pageSize=100", []);

  const allThreads = threadData?.data ?? [];

  // Client-side filtering
  const filteredThreads = allThreads.filter((t) => {
    if (filter === "decision") return t.status === "WAITING_CONTROLLER";
    if (filter === "active") return !["RESOLVED", "STALE"].includes(t.status);
    if (filter === "resolved") return t.status === "RESOLVED";
    return true;
  });

  // Search
  const searchedThreads = search
    ? filteredThreads.filter(
        (t) =>
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          (t.externalName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (t.summary ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : filteredThreads;

  // Sort: CRITICAL first, then HIGH, then by lastActivityAt desc
  const priorityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedThreads = [...searchedThreads].sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    if (pDiff !== 0) return pDiff;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  // Counts
  const decisionCount = allThreads.filter((t) => t.status === "WAITING_CONTROLLER").length;
  const activeCount = allThreads.filter((t) => !["RESOLVED", "STALE"].includes(t.status)).length;
  const resolvedCount = allThreads.filter((t) => t.status === "RESOLVED").length;

  // Selected thread detail (full messages)
  const { data: detailData, refetch: refetchDetail } = useFetch<{ data: AgentThread }>(
    selectedId ? `/api/threads/${selectedId}` : null,
    [selectedId]
  );
  const selectedThread = detailData?.data ?? null;

  // Action handler
  async function handleAction(threadId: string, action: string) {
    setActing(true);
    try {
      await api.post(`/api/threads/${threadId}/messages`, {
        message: `Acción: ${action}`,
        actionTaken: action,
      });
      refetch();
      refetchDetail();
    } catch {
      /* logged server-side */
    }
    setActing(false);
  }

  // Chat handler
  async function handleChat(threadId: string, message: string) {
    setActing(true);
    try {
      await api.post(`/api/threads/${threadId}/messages`, { message });
      refetchDetail();
    } catch {
      /* logged server-side */
    }
    setActing(false);
  }

  // Resolve handler
  async function handleResolve(threadId: string) {
    setActing(true);
    try {
      await api.post(`/api/threads/${threadId}/resolve`);
      refetch();
      refetchDetail();
    } catch {
      /* logged server-side */
    }
    setActing(false);
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* LEFT: Thread list */}
      <div className="w-[400px] border-r border-gray-200 overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-xl font-semibold text-gray-900">Centro de Seguimientos</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            El agente gestiona seguimientos. Intervén cuando te lo pida.
          </p>

          {/* Search */}
          <div className="relative mt-3">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <FilterButton
              label="Todos"
              count={allThreads.length}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterButton
              label="Decisión"
              count={decisionCount}
              active={filter === "decision"}
              onClick={() => setFilter("decision")}
            />
            <FilterButton
              label="Activos"
              count={activeCount}
              active={filter === "active"}
              onClick={() => setFilter("active")}
            />
            <FilterButton
              label="Resueltos"
              count={resolvedCount}
              active={filter === "resolved"}
              onClick={() => setFilter("resolved")}
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">Cargando...</div>
          ) : sortedThreads.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Bot size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {allThreads.length === 0 ? "No hay seguimientos" : "Sin resultados en este filtro"}
              </p>
              {allThreads.length === 0 && (
                <p className="text-xs mt-1">El agente creará hilos durante el ciclo diario</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sortedThreads.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  selected={selectedId === thread.id}
                  onClick={() => setSelectedId(thread.id)}
                />
              ))}
            </div>
          )}

          {/* Legacy inquiries collapsed */}
          <LegacyInquiriesSection />
        </div>
      </div>

      {/* RIGHT: Detail panel */}
      <div className="flex-1 overflow-hidden">
        {selectedThread ? (
          <ThreadDetailPanel
            thread={selectedThread}
            onAction={handleAction}
            onChat={handleChat}
            onResolve={handleResolve}
            acting={acting}
          />
        ) : (
          <EmptyDetailState />
        )}
      </div>
    </div>
  );
}
