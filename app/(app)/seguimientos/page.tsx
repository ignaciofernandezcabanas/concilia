"use client";

import { useState, useEffect, useRef } from "react";
import { useFetch } from "@/hooks/useApi";
import { Bot, Send, Search, FileText } from "lucide-react";
import { api } from "@/lib/api-client";
import {
  FOLLOWUP_ACTION,
  FOLLOWUP_SCENARIO,
  THREAD_STATUS,
  THREAD_PRIORITY,
  MESSAGE_ROLE,
  t,
} from "@/lib/i18n/enums";
import { formatRelativeWithTitle } from "@/lib/format";

// ── Types ──

interface ThreadMessage {
  id: string;
  role: "AGENT" | "CONTROLLER" | "EXTERNAL" | "SYSTEM";
  channel: "APP" | "EMAIL";
  content: string;
  contentHtml?: string;
  suggestedActions?: Array<{ type: string; label: string }>;
  actionTaken?: string;
  attachmentUrls?: string[];
  attachmentNames?: string[];
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
  supportingDocUrls?: string[];
  messages: ThreadMessage[];
}

// ── Constants ──

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-l-4 border-l-red-500 bg-red-50/50",
  HIGH: "border-l-4 border-l-amber-500 bg-amber-50/30",
  MEDIUM: "border-l-4 border-l-blue-400",
  LOW: "border-l-4 border-l-gray-300",
};

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: t(THREAD_PRIORITY, "CRITICAL"), className: "bg-red-100 text-red-700" },
  HIGH: { label: t(THREAD_PRIORITY, "HIGH"), className: "bg-amber-100 text-amber-700" },
  MEDIUM: { label: t(THREAD_PRIORITY, "MEDIUM"), className: "bg-blue-100 text-blue-700" },
  LOW: { label: t(THREAD_PRIORITY, "LOW"), className: "bg-gray-100 text-gray-600" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  AGENT_WORKING: { label: t(THREAD_STATUS, "AGENT_WORKING"), color: "text-blue-600" },
  WAITING_EXTERNAL: { label: t(THREAD_STATUS, "WAITING_EXTERNAL"), color: "text-amber-600" },
  WAITING_CONTROLLER: { label: t(THREAD_STATUS, "WAITING_CONTROLLER"), color: "text-red-600" },
  RESOLVED: { label: t(THREAD_STATUS, "RESOLVED"), color: "text-green-600" },
  STALE: { label: t(THREAD_STATUS, "STALE"), color: "text-gray-500" },
};

const ROLE_STYLES: Record<string, { label: string; bg: string }> = {
  SYSTEM: { label: t(MESSAGE_ROLE, "SYSTEM"), bg: "bg-gray-50" },
  AGENT: { label: t(MESSAGE_ROLE, "AGENT"), bg: "bg-blue-50" },
  EXTERNAL: { label: t(MESSAGE_ROLE, "EXTERNAL"), bg: "bg-amber-50" },
  CONTROLLER: { label: t(MESSAGE_ROLE, "CONTROLLER"), bg: "bg-green-50" },
};

type FilterKey = "all" | "decision" | "active" | "resolved";

// ── Helpers ──

// daysAgoLabel replaced by formatRelativeWithTitle from lib/format.ts

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
            {t(FOLLOWUP_SCENARIO, thread.scenario)}
          </span>
          <p className="font-medium text-sm text-gray-900 truncate" title={thread.subject}>
            {thread.subject}
          </p>
          <p
            className="text-xs text-gray-500 mt-0.5 truncate"
            title={thread.summary ?? lastMsg?.content?.slice(0, 80) ?? ""}
          >
            {thread.summary ?? lastMsg?.content?.slice(0, 80) ?? ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-[10px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
          {(() => {
            const { relative, absolute } = formatRelativeWithTitle(thread.lastActivityAt);
            return (
              <p className="text-[10px] text-gray-400 mt-0.5" title={absolute}>
                {relative}
              </p>
            );
          })()}
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
  bottomRef,
}: {
  thread: AgentThread;
  onAction: (threadId: string, action: string) => void;
  onChat: (threadId: string, message: string) => void;
  onResolve: (threadId: string) => void;
  acting: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
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
          <span className="text-xs text-gray-500">{t(FOLLOWUP_SCENARIO, thread.scenario)}</span>
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
        {thread.supportingDocUrls && thread.supportingDocUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {thread.supportingDocUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target={url.startsWith("http") ? "_blank" : undefined}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100"
              >
                <FileText size={12} /> {url.split("/").pop() || `Documento ${i + 1}`}
              </a>
            ))}
          </div>
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
              {msg.attachmentUrls && msg.attachmentUrls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {msg.attachmentUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                    >
                      <FileText size={12} /> {msg.attachmentNames?.[i] || `Adjunto ${i + 1}`}
                    </a>
                  ))}
                </div>
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
                  Acción: {t(FOLLOWUP_ACTION, msg.actionTaken)}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
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
      <span className="ml-1 opacity-80">({count})</span>
    </button>
  );
}

// ── Main Page ──

export default function SeguimientosPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null!);

  // Fetch ALL threads (no status filter — client filters)
  const {
    data: threadData,
    loading,
    error: threadError,
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

  // Counts (from search-filtered list so searching narrows counters)
  const decisionCount = searchedThreads.filter((t) => t.status === "WAITING_CONTROLLER").length;
  const activeCount = searchedThreads.filter(
    (t) => !["RESOLVED", "STALE"].includes(t.status)
  ).length;
  const resolvedCount = searchedThreads.filter((t) => t.status === "RESOLVED").length;

  // Selected thread detail (full messages)
  const { data: detailData, refetch: refetchDetail } = useFetch<{ data: AgentThread }>(
    selectedId ? `/api/threads/${selectedId}` : null,
    [selectedId]
  );
  const selectedThread = detailData?.data ?? null;

  // Auto-scroll chat when detail loads
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detailData]);

  // Clear detail when filters yield no results
  useEffect(() => {
    if (sortedThreads.length === 0) {
      setSelectedId(null);
    }
  }, [sortedThreads.length]);

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
              count={searchedThreads.length}
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
          ) : threadError ? (
            <div className="p-4 text-sm text-red-500">
              <p className="font-medium">Error al cargar seguimientos</p>
              <p className="text-xs mt-1">{threadError}</p>
              <button onClick={refetch} className="text-xs text-accent mt-2 hover:underline">
                Reintentar
              </button>
            </div>
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

          {/* Legacy inquiries removed — all data lives in AgentThread now */}
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
            bottomRef={bottomRef}
          />
        ) : (
          <EmptyDetailState />
        )}
      </div>
    </div>
  );
}
