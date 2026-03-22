"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useFetch } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import {
  ChevronDown,
  Building2,
  Check,
  Layers,
  Plus,
} from "lucide-react";

interface OrgCompany {
  id: string;
  name: string;
  shortName: string | null;
  cif: string | null;
  type: string;
  role: string;
}

interface Membership {
  id: string;
  role: string;
  organization: { id: string; name: string };
  companies: OrgCompany[];
}

interface ContextResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    activeOrgId: string | null;
    activeCompanyId: string | null;
  };
  memberships: Membership[];
}

export default function ContextSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { refreshContext } = useAuth();

  const { data, loading, refetch } = useFetch<ContextResponse>("/api/auth/context");

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const switchCompany = useCallback(
    async (companyId: string, orgId: string) => {
      await api.put("/api/auth/context", { companyId, orgId });
      setOpen(false);
      refetch();
      refreshContext();
      router.refresh();
    },
    [refetch, refreshContext, router]
  );

  const switchConsolidated = useCallback(
    async (orgId: string) => {
      await api.put("/api/auth/context", { companyId: null, orgId });
      setOpen(false);
      refetch();
      refreshContext();
      router.refresh();
    },
    [refetch, refreshContext, router]
  );

  if (loading || !data) return null;

  const { user, memberships } = data;

  // If the user has only 1 company total across all memberships, don't show the switcher
  const totalCompanies = memberships.reduce((sum, m) => sum + m.companies.length, 0);
  if (totalCompanies <= 1 && memberships.length <= 1) return null;

  // Find active company
  const activeCompanyId = user.activeCompanyId;
  const activeOrgId = user.activeOrgId;
  let activeLabel = "Seleccionar empresa";
  let isConsolidated = false;

  if (activeCompanyId) {
    for (const m of memberships) {
      const co = m.companies.find((c) => c.id === activeCompanyId);
      if (co) {
        activeLabel = co.shortName || co.name;
        break;
      }
    }
  } else if (activeOrgId) {
    // No company selected → consolidated view
    const m = memberships.find((m) => m.organization.id === activeOrgId);
    if (m) {
      activeLabel = `${m.organization.name} (Consolidado)`;
      isConsolidated = true;
    }
  }

  return (
    <div ref={ref} className="relative px-3 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-surface border border-subtle hover:border-border-secondary transition-colors text-left"
      >
        <Building2 size={14} className="text-text-tertiary shrink-0" />
        <span className="text-[12px] font-medium text-text-primary truncate flex-1">
          {activeLabel}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-tertiary shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-lg border border-subtle shadow-lg z-50 max-h-[320px] overflow-auto">
          {memberships.map((m) => {
            const isOwnerAdmin = m.role === "OWNER" || m.role === "ADMIN";

            return (
              <div key={m.id}>
                {/* Organization header */}
                {memberships.length > 1 && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wide bg-page">
                    {m.organization.name}
                  </div>
                )}

                {/* Consolidated option (only for OWNER/ADMIN) */}
                {isOwnerAdmin && m.companies.length > 1 && (
                  <button
                    onClick={() => switchConsolidated(m.organization.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-hover transition-colors"
                  >
                    <Layers size={14} className="text-accent shrink-0" />
                    <span className="flex-1 text-left font-medium text-accent">
                      Consolidado
                    </span>
                    {isConsolidated && activeOrgId === m.organization.id && (
                      <Check size={14} className="text-accent" />
                    )}
                  </button>
                )}

                {/* Companies */}
                {m.companies.map((co) => (
                  <button
                    key={co.id}
                    onClick={() => switchCompany(co.id, m.organization.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-hover transition-colors"
                  >
                    <Building2 size={14} className="text-text-tertiary shrink-0" />
                    <span className="flex-1 text-left truncate text-text-primary">
                      {co.shortName || co.name}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {co.cif}
                    </span>
                    {!isConsolidated && activeCompanyId === co.id && (
                      <Check size={14} className="text-accent" />
                    )}
                  </button>
                ))}
              </div>
            );
          })}

          {/* Add company */}
          <div className="border-t border-subtle">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/onboarding?add=true");
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-secondary hover:bg-hover transition-colors"
            >
              <Plus size={14} />
              <span>Añadir sociedad</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
