"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import { useNotifications } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Bell,
  FileText,
  RefreshCw,
  Scale,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";

const TYPE_ICONS: Record<string, LucideIcon> = {
  RECONCILIATION: Scale,
  SYNC: RefreshCw,
  ARCHIVE: FileText,
  SYSTEM: Shield,
  FINANCIAL_ALERT: AlertTriangle,
};

const TYPE_COLORS: Record<string, { icon: string; bg: string }> = {
  RECONCILIATION: { icon: "text-accent", bg: "bg-accent-light" },
  SYNC: { icon: "text-green", bg: "bg-green-light" },
  ARCHIVE: { icon: "text-accent", bg: "bg-accent-light" },
  SYSTEM: { icon: "text-text-secondary", bg: "bg-hover" },
  FINANCIAL_ALERT: { icon: "text-amber", bg: "bg-amber-light" },
};

export default function Notificaciones() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useNotifications({
    isRead: filter === "unread" ? "false" : undefined,
    page,
    pageSize: 25,
  });

  const notifications = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  async function markAllRead() {
    try {
      await api.post("/api/notifications", { markAllRead: true });
      refetch();
    } catch (err) {
      console.error("Error marking read:", err);
    }
  }

  async function markRead(ids: string[]) {
    try {
      await api.post("/api/notifications", { ids });
      refetch();
    } catch (err) {
      console.error("Error marking read:", err);
    }
  }

  const tabs = [
    { value: "", label: "Todas" },
    { value: "unread", label: "No leídas" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Notificaciones" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-text-primary">Notificaciones</h1>
          <button
            onClick={markAllRead}
            className="text-[13px] text-accent font-medium hover:underline"
          >
            Marcar todas como leídas
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white border border-subtle rounded-md w-fit overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setFilter(tab.value); setPage(1); }}
              className={`px-3 py-1.5 text-[13px] font-medium ${
                filter === tab.value
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:bg-hover"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="Sin notificaciones" description="No hay notificaciones pendientes." />
        ) : (
          <div className="flex flex-col bg-white rounded-lg border border-subtle overflow-hidden">
            {notifications.map((notif, i) => {
              const Icon = TYPE_ICONS[notif.type] ?? Bell;
              const colors = TYPE_COLORS[notif.type] ?? { icon: "text-text-secondary", bg: "bg-hover" };

              return (
                <button
                  key={notif.id}
                  onClick={() => {
                    if (!notif.isRead) markRead([notif.id]);
                    if (notif.actionUrl) router.push(notif.actionUrl);
                  }}
                  className={`flex items-start gap-3 p-4 text-left ${
                    i < notifications.length - 1 ? "border-b border-border-light" : ""
                  } ${!notif.isRead ? "bg-accent-light/30" : ""} hover:bg-hover/50 transition-colors`}
                >
                  <div className={`w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={16} className={colors.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-text-primary">
                        {notif.title}
                      </span>
                      {!notif.isRead && (
                        <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{notif.body}</p>
                    <span className="text-[11px] text-text-tertiary mt-1 block">
                      {new Date(notif.createdAt).toLocaleString("es-ES")}
                    </span>
                  </div>
                  {notif.actionUrl && (
                    <span className="text-xs text-accent font-medium shrink-0 mt-1">
                      Ver →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
