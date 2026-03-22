"use client";

import { Loader2 } from "lucide-react";

export default function ProcessingOverlay({
  title = "Procesando...",
  subtitle,
  show,
}: {
  title?: string;
  subtitle?: string;
  show: boolean;
}) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3 rounded-lg">
      <Loader2 size={32} className="text-accent animate-spin" />
      <span className="text-[14px] font-semibold text-text-primary">{title}</span>
      {subtitle && (
        <span className="text-[12px] text-text-secondary text-center max-w-xs">{subtitle}</span>
      )}
    </div>
  );
}
