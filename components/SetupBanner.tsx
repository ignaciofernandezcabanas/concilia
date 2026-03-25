"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * Banner shown on the dashboard when Company.needsBusinessProfile is true.
 * Prompts the user to complete the initial setup wizard.
 */
export default function SetupBanner() {
  return (
    <Link
      href="/setup"
      className="flex items-center gap-3 bg-accent/5 border border-accent/30 rounded-lg p-4 hover:bg-accent/10 transition-colors group"
    >
      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <Sparkles size={18} className="text-accent" />
      </div>
      <div className="flex-1">
        <span className="text-[13px] font-semibold text-text-primary block">
          Completa la configuraci&oacute;n de tu empresa
        </span>
        <span className="text-[12px] text-text-secondary">
          Personaliza Concilia con tu plan de cuentas, m&oacute;dulos fiscales y patrones de negocio
        </span>
      </div>
      <ArrowRight
        size={16}
        className="text-accent group-hover:translate-x-0.5 transition-transform shrink-0"
      />
    </Link>
  );
}
