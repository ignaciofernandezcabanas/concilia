"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useCompany } from "@/hooks/useApi";
import ContextSwitcher from "@/components/ContextSwitcher";
import { useFetch } from "@/hooks/useApi";
import {
  LayoutDashboard,
  GitCompare,
  FileText,
  Landmark,
  BookOpen,
  List,
  Package,
  BarChart3,
  TrendingUp,
  Scale,
  Wallet,
  Clock,
  ArrowLeftRight,
  Layers,
  ListFilter,
  Bell,
  Settings,
  LogOut,
  Mail,
  Receipt,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
  groupOnly?: boolean;
}

const sections: NavSection[] = [
  {
    title: "DIARIO",
    items: [
      { label: "Resumen", icon: LayoutDashboard, href: "/" },
      { label: "Bandeja", icon: GitCompare, href: "/conciliacion" },
      { label: "Seguimientos", icon: Mail, href: "/seguimientos" },
      { label: "Movimientos", icon: Landmark, href: "/movimientos" },
      { label: "Facturas", icon: FileText, href: "/facturas" },
    ],
  },
  {
    title: "CONTABILIDAD",
    items: [
      { label: "Asientos", icon: BookOpen, href: "/asientos" },
      { label: "Plan de cuentas", icon: List, href: "/plan-cuentas" },
      { label: "Activos", icon: Package, href: "/activos" },
      { label: "Inversiones", icon: Briefcase, href: "/inversiones" },
    ],
  },
  {
    title: "REPORTING",
    items: [
      { label: "PyG", icon: BarChart3, href: "/pyg" },
      { label: "Balance", icon: Scale, href: "/balance" },
      { label: "Cashflow", icon: TrendingUp, href: "/cashflow" },
      { label: "Tesorería", icon: Wallet, href: "/tesoreria" },
      { label: "Cuentas a cobrar", icon: Clock, href: "/cuentas-cobrar" },
      { label: "Fiscal", icon: Receipt, href: "/ajustes?tab=fiscal" },
    ],
  },
  {
    title: "GRUPO",
    groupOnly: true,
    items: [
      { label: "Intercompañía", icon: ArrowLeftRight, href: "/intercompania" },
      { label: "Consolidado", icon: Layers, href: "/consolidado" },
    ],
  },
  {
    title: "SISTEMA",
    items: [
      { label: "Reglas", icon: ListFilter, href: "/reglas" },
      { label: "Notificaciones", icon: Bell, href: "/notificaciones" },
      { label: "Ajustes", icon: Settings, href: "/ajustes" },
    ],
  },
];

interface ContextResponse {
  memberships: Array<{ companies: Array<{ id: string }> }>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { data: companyData } = useCompany();
  const { data: ctxData } = useFetch<ContextResponse>("/api/auth/context");

  const company = companyData?.company;

  // Detect multi-company org for GRUPO section
  const totalCompanies = ctxData?.memberships?.reduce((sum, m) => sum + m.companies.length, 0) ?? 0;
  const isGroup = totalCompanies > 1;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "?";

  return (
    <aside className="w-[220px] min-w-[220px] h-screen bg-white border-r border-subtle flex flex-col pt-5 sticky top-0 overflow-y-auto">
      <div className="flex items-center gap-2 h-10 px-4 mb-2">
        <span className="text-lg font-bold text-text-primary">Concilia</span>
      </div>

      <ContextSwitcher />

      <div className="flex flex-col gap-0.5 flex-1">
        {sections.map((section) => {
          if (section.groupOnly && !isGroup) return null;

          return (
            <div key={section.title}>
              <div className="px-5 pt-4 pb-1">
                <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  {section.title}
                </span>
              </div>
              <nav className="flex flex-col gap-0.5 px-2.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 h-8 px-3 rounded-md text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-accent-light text-accent font-semibold"
                          : "text-text-secondary hover:bg-hover"
                      }`}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      <div className="border-t border-subtle px-4 py-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-[10px] font-semibold">
            {initials}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[13px] font-medium text-text-primary truncate">
              {user?.email ?? "—"}
            </span>
          </div>
          <button
            onClick={signOut}
            className="text-text-tertiary hover:text-red transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
        {company && <span className="text-[11px] text-text-tertiary truncate">{company.name}</span>}
      </div>
    </aside>
  );
}
