"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useSearch, useNotifications } from "@/hooks/useApi";

export default function TopBar({ title }: { title: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { data: searchResults } = useSearch(query);
  const { data: notifData } = useNotifications({ isRead: "false", pageSize: 1 });
  const unreadCount = notifData?.pagination?.total ?? 0;

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "?";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex items-center justify-between h-12 px-6 bg-white border-b border-subtle shrink-0">
      <span className="text-[15px] font-semibold text-text-primary">{title}</span>

      {/* Search */}
      <div className="relative" ref={searchRef}>
        <div
          className="flex items-center gap-2 bg-page border border-subtle rounded-md px-3 h-8 w-80 cursor-text"
          onClick={() => setShowSearch(true)}
        >
          <Search size={14} className="text-text-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSearch(true);
            }}
            placeholder="Buscar facturas, movimientos..."
            className="bg-transparent text-[13px] text-text-primary outline-none flex-1 placeholder:text-text-tertiary"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setShowSearch(false);
              }}
            >
              <X size={12} className="text-text-tertiary" />
            </button>
          )}
        </div>

        {showSearch && query.length >= 2 && searchResults && (
          <div className="absolute top-full mt-1 left-0 w-full bg-white border border-subtle rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
            {searchResults.invoices?.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase">
                  Facturas
                </div>
                {searchResults.invoices.map((inv) => (
                  <button
                    key={inv.id}
                    className="w-full px-3 py-2 text-left hover:bg-hover text-[13px] text-text-primary"
                    onClick={() => {
                      router.push(`/facturas`);
                      setShowSearch(false);
                      setQuery("");
                    }}
                  >
                    <span className="font-medium text-accent">{inv.number}</span>
                    {" — "}
                    {inv.contact?.name ?? inv.description ?? "Sin descripción"}
                  </button>
                ))}
              </div>
            )}
            {searchResults.transactions?.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase">
                  Movimientos
                </div>
                {searchResults.transactions.map((tx) => (
                  <button
                    key={tx.id}
                    className="w-full px-3 py-2 text-left hover:bg-hover text-[13px] text-text-primary"
                    onClick={() => {
                      router.push(`/movimientos`);
                      setShowSearch(false);
                      setQuery("");
                    }}
                  >
                    {tx.concept ?? tx.counterpartName ?? "Movimiento"}
                  </button>
                ))}
              </div>
            )}
            {searchResults.contacts?.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase">
                  Contactos
                </div>
                {searchResults.contacts.map((c) => (
                  <div key={c.id} className="px-3 py-2 text-[13px] text-text-primary">
                    {c.name} {c.cif ? `(${c.cif})` : ""}
                  </div>
                ))}
              </div>
            )}
            {!searchResults.invoices?.length &&
              !searchResults.transactions?.length &&
              !searchResults.contacts?.length && (
                <div className="px-3 py-4 text-[13px] text-text-tertiary text-center">
                  Sin resultados para &ldquo;{query}&rdquo;
                </div>
              )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button className="relative" onClick={() => router.push("/notificaciones")}>
          <Bell size={20} className="text-text-secondary" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-[10px] font-semibold">
          {initials}
        </div>
      </div>
    </header>
  );
}
