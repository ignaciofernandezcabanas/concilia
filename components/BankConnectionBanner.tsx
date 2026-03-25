"use client";

import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import { useFetch } from "@/hooks/useApi";

interface AccountsResponse {
  accounts: {
    operativas: unknown[];
    financiacion: unknown[];
    inactivas: unknown[];
  };
}

/**
 * Banner shown on Dashboard and Conciliación when no active bank accounts exist.
 * Prompts the user to connect their first bank account.
 */
export default function BankConnectionBanner() {
  const { data, loading } = useFetch<AccountsResponse>("/api/bank-accounts");
  const { data: txData } = useFetch<{ pagination: { total: number } }>(
    "/api/transactions?pageSize=1"
  );

  if (loading) return null;

  const hasActive =
    (data?.accounts?.operativas?.length ?? 0) + (data?.accounts?.financiacion?.length ?? 0) > 0;
  const hasTxData = (txData?.pagination?.total ?? 0) > 0;

  if (hasActive || hasTxData) return null;

  return (
    <Link
      href="/ajustes/bancos"
      className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors group"
    >
      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
        <Building2 size={18} className="text-blue-600" />
      </div>
      <div className="flex-1">
        <span className="text-[13px] font-semibold text-text-primary block">
          Conecta tu cuenta bancaria para empezar
        </span>
        <span className="text-[12px] text-text-secondary">
          Configura tus cuentas bancarias para importar movimientos y conciliar
        </span>
      </div>
      <ArrowRight
        size={16}
        className="text-blue-600 group-hover:translate-x-0.5 transition-transform shrink-0"
      />
    </Link>
  );
}
