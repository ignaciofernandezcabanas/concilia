"use client";

import { Inbox, type LucideIcon } from "lucide-react";

export default function EmptyState({
  title = "Sin datos",
  description = "No hay datos disponibles.",
  icon: Icon = Inbox,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={40} className="text-text-tertiary mb-3" />
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      <p className="text-xs text-text-secondary mt-1 max-w-sm">{description}</p>
    </div>
  );
}
