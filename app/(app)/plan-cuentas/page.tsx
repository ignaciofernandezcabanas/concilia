"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFetch } from "@/hooks/useApi";
import { qs } from "@/lib/api-client";
import { formatAmount } from "@/lib/format";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  group: number;
  parentCode: string | null;
}

interface LedgerMovement {
  date: string;
  description: string;
  reference: string | null;
  source: string;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerResponse {
  account: { code: string; name: string; group: number };
  movements: LedgerMovement[];
  totals: { debit: number; credit: number; balance: number };
  count: number;
}

interface TrialBalanceAccount {
  code: string;
  name: string;
  group: number;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalanceResponse {
  accounts: TrialBalanceAccount[];
  totals: { debit: number; credit: number; balanced: boolean };
}

type Tab = "cuentas" | "mayor" | "sumas";

const GROUP_NAMES: Record<number, string> = {
  1: "Financiación básica",
  2: "Activo no corriente",
  3: "Existencias",
  4: "Acreedores y deudores",
  5: "Cuentas financieras",
  6: "Compras y gastos",
  7: "Ventas e ingresos",
};

export default function PlanCuentasPage() {
  const [tab, setTab] = useState<Tab>("cuentas");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: accountsData, loading: accountsLoading } = useFetch<{ accounts: Account[] }>(
    `/api/settings/accounts${qs({ all: "true" })}`
  );

  const { data: ledgerData, loading: ledgerLoading } = useFetch<LedgerResponse>(
    selectedAccount ? `/api/reports/ledger${qs({ accountCode: selectedAccount, from, to })}` : null,
    [selectedAccount, from, to]
  );

  const { data: trialData, loading: trialLoading } = useFetch<TrialBalanceResponse>(
    tab === "sumas" ? `/api/reports/trial-balance${qs({ from, to })}` : null,
    [tab, from, to]
  );

  const accounts = accountsData?.accounts ?? [];
  const groups = Array.from(new Set(accounts.map((a) => a.group))).sort();

  function toggleGroup(g: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function selectAccount(code: string) {
    setSelectedAccount(code);
    setTab("mayor");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "cuentas", label: "Plan de cuentas" },
    { key: "mayor", label: "Libro mayor" },
    { key: "sumas", label: "Sumas y saldos" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Plan de cuentas" />
      <div className="flex flex-col gap-5 p-6 px-8 flex-1 overflow-auto">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-subtle">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Plan de cuentas */}
        {tab === "cuentas" &&
          (accountsLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="bg-white rounded-lg border border-subtle overflow-hidden">
              {groups.map((g) => {
                const expanded = expandedGroups.has(g);
                const groupAccounts = accounts.filter((a) => a.group === g);
                return (
                  <div key={g}>
                    <button
                      onClick={() => toggleGroup(g)}
                      className="flex items-center w-full h-10 px-5 border-b border-border-light hover:bg-page transition-colors text-left"
                    >
                      {expanded ? (
                        <ChevronDown size={14} className="text-text-tertiary mr-2" />
                      ) : (
                        <ChevronRight size={14} className="text-text-tertiary mr-2" />
                      )}
                      <span className="text-[13px] font-semibold text-text-primary">Grupo {g}</span>
                      <span className="text-[12px] text-text-tertiary ml-2">
                        — {GROUP_NAMES[g] ?? ""}
                      </span>
                      <span className="ml-auto text-[11px] text-text-tertiary">
                        {groupAccounts.length} cuentas
                      </span>
                    </button>
                    {expanded &&
                      groupAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => selectAccount(acc.code)}
                          className="flex items-center w-full h-9 px-5 pl-12 border-b border-border-light hover:bg-accent-light/10 transition-colors text-left"
                        >
                          <span className="w-16 text-[13px] font-mono text-accent">{acc.code}</span>
                          <span className="flex-1 text-[13px] text-text-primary">{acc.name}</span>
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          ))}

        {/* Tab: Libro mayor */}
        {tab === "mayor" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="h-9 px-3 text-[13px] border border-subtle rounded-md min-w-[250px]"
              >
                <option value="">Seleccionar cuenta...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 px-3 text-[13px] border border-subtle rounded-md"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 px-3 text-[13px] border border-subtle rounded-md"
              />
            </div>

            {!selectedAccount ? (
              <p className="text-[13px] text-text-tertiary py-8 text-center">
                Selecciona una cuenta para ver el libro mayor.
              </p>
            ) : ledgerLoading ? (
              <LoadingSpinner />
            ) : ledgerData ? (
              <div className="bg-white rounded-lg border border-subtle overflow-hidden">
                <div className="px-5 py-3 border-b border-subtle bg-page">
                  <span className="text-[14px] font-semibold text-text-primary">
                    {ledgerData.account.code} — {ledgerData.account.name}
                  </span>
                  <span className="text-[12px] text-text-tertiary ml-3">
                    {ledgerData.count} movimientos
                  </span>
                </div>
                <div className="flex items-center h-9 px-5 border-b border-subtle text-[11px] font-semibold text-text-tertiary">
                  <span className="w-24">Fecha</span>
                  <span className="flex-1">Descripción</span>
                  <span className="w-20 text-right">Debe</span>
                  <span className="w-20 text-right">Haber</span>
                  <span className="w-24 text-right">Saldo</span>
                </div>
                {ledgerData.movements.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center h-9 px-5 border-b border-border-light text-[12px]"
                  >
                    <span className="w-24 text-text-secondary">
                      {new Date(m.date).toLocaleDateString("es-ES")}
                    </span>
                    <span className="flex-1 text-text-primary truncate">{m.description}</span>
                    <span className="w-20 text-right font-mono">
                      {m.debit > 0 ? formatAmount(m.debit) : ""}
                    </span>
                    <span className="w-20 text-right font-mono">
                      {m.credit > 0 ? formatAmount(m.credit) : ""}
                    </span>
                    <span className="w-24 text-right font-mono font-semibold">
                      {formatAmount(m.balance)}
                    </span>
                  </div>
                ))}
                {/* Totals */}
                <div className="flex items-center h-10 px-5 bg-page text-[12px] font-semibold">
                  <span className="w-24" />
                  <span className="flex-1 text-text-primary">Total</span>
                  <span className="w-20 text-right font-mono">
                    {formatAmount(ledgerData.totals.debit)}
                  </span>
                  <span className="w-20 text-right font-mono">
                    {formatAmount(ledgerData.totals.credit)}
                  </span>
                  <span className="w-24 text-right font-mono text-accent">
                    {formatAmount(ledgerData.totals.balance)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Tab: Sumas y saldos */}
        {tab === "sumas" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 px-3 text-[13px] border border-subtle rounded-md"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 px-3 text-[13px] border border-subtle rounded-md"
              />
            </div>

            {trialLoading ? (
              <LoadingSpinner />
            ) : trialData ? (
              <div className="bg-white rounded-lg border border-subtle overflow-hidden">
                {!trialData.totals.balanced && (
                  <div className="px-5 py-2 bg-red-light text-[12px] text-red-text font-medium">
                    El balance no cuadra: Debe ({formatAmount(trialData.totals.debit)}) ≠ Haber (
                    {formatAmount(trialData.totals.credit)})
                  </div>
                )}
                <div className="flex items-center h-9 px-5 border-b border-subtle text-[11px] font-semibold text-text-tertiary">
                  <span className="w-16">Código</span>
                  <span className="flex-1">Cuenta</span>
                  <span className="w-24 text-right">Debe</span>
                  <span className="w-24 text-right">Haber</span>
                  <span className="w-24 text-right">Saldo</span>
                </div>
                {trialData.accounts.map((a) => (
                  <div
                    key={a.code}
                    className="flex items-center h-9 px-5 border-b border-border-light text-[12px]"
                  >
                    <span className="w-16 font-mono text-accent">{a.code}</span>
                    <span className="flex-1 text-text-primary">{a.name}</span>
                    <span className="w-24 text-right font-mono">{formatAmount(a.debit)}</span>
                    <span className="w-24 text-right font-mono">{formatAmount(a.credit)}</span>
                    <span
                      className={`w-24 text-right font-mono font-semibold ${a.balance >= 0 ? "text-text-primary" : "text-red-text"}`}
                    >
                      {formatAmount(a.balance)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center h-10 px-5 bg-page text-[12px] font-semibold">
                  <span className="w-16" />
                  <span className="flex-1 text-text-primary">Total</span>
                  <span className="w-24 text-right font-mono">
                    {formatAmount(trialData.totals.debit)}
                  </span>
                  <span className="w-24 text-right font-mono">
                    {formatAmount(trialData.totals.credit)}
                  </span>
                  <span className="w-24" />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
