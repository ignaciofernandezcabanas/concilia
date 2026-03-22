"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useCompany } from "@/hooks/useApi";
import {
  LayoutDashboard,
  GitCompare,
  FileText,
  Landmark,
  BarChart3,
  TrendingUp,
  Scale,

  ListFilter,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

const mainNav = [
  { label: "Resumen", icon: LayoutDashboard, href: "/" },
  { label: "Conciliación", icon: GitCompare, href: "/conciliacion" },
  { label: "Facturas", icon: FileText, href: "/facturas" },
  { label: "Movimientos", icon: Landmark, href: "/movimientos" },
  { label: "Balance", icon: Scale, href: "/balance" },
  { label: "PyG", icon: BarChart3, href: "/pyg" },
  { label: "Cashflow", icon: TrendingUp, href: "/cashflow" },
];

const secondaryNav = [
  { label: "Reglas", icon: ListFilter, href: "/reglas" },
  { label: "Notificaciones", icon: Bell, href: "/notificaciones" },
  { label: "Ajustes", icon: Settings, href: "/ajustes" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { data: companyData } = useCompany();

  const company = companyData?.company;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="w-[220px] min-w-[220px] h-screen bg-white border-r border-subtle flex flex-col pt-5 sticky top-0">
      <div className="flex items-center gap-2 h-10 px-4 mb-0">
        <span className="text-lg font-bold text-text-primary">Concilia</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 pt-4">
        {mainNav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-colors ${
                active
                  ? "bg-accent-light text-accent font-semibold"
                  : "text-text-secondary hover:bg-hover"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="h-px bg-subtle mx-0 my-0" />

      <nav className="flex flex-col gap-0.5 px-2.5 py-2">
        {secondaryNav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-colors ${
                active
                  ? "bg-accent-light text-accent font-semibold"
                  : "text-text-secondary hover:bg-hover"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

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
        {company && (
          <span className="text-[11px] text-text-tertiary truncate">
            {company.name}
          </span>
        )}
      </div>
    </aside>
  );
}
