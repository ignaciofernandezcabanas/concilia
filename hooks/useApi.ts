"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, qs, ApiError } from "@/lib/api-client";

// ── Generic paginated response (matches backend pagination.ts) ──
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  // Convenience accessors
  total?: number;
  totalPages?: number;
}

// ── Generic fetch hook ──
export function useFetch<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<T>(path).then((result) => {
      if (!cancelled) setData(result);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : "Error de conexión");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refetch, setData };
}

// ── Invoices ──
export function useInvoices(filters: Record<string, unknown> = {}) {
  const path = `/api/invoices${qs(filters)}`;
  return useFetch<PaginatedResponse<Invoice>>(path, [JSON.stringify(filters)]);
}

// ── Transactions ──
export function useTransactions(filters: Record<string, unknown> = {}) {
  const path = `/api/transactions${qs(filters)}`;
  return useFetch<PaginatedResponse<BankTransaction>>(path, [JSON.stringify(filters)]);
}

// ── Notifications ──
export function useNotifications(filters: Record<string, unknown> = {}) {
  const path = `/api/notifications${qs(filters)}`;
  return useFetch<PaginatedResponse<Notification>>(path, [JSON.stringify(filters)]);
}

// ── Reports ──
export function usePyG(from: string, to: string, level = 3) {
  const path = `/api/reports/pyg${qs({ from, to, level })}`;
  return useFetch<PyGReport>(path, [from, to, level]);
}

export function useCashflow(from: string, to: string, mode = "direct") {
  const path = `/api/reports/cashflow${qs({ from, to, mode })}`;
  return useFetch<CashflowReport>(path, [from, to, mode]);
}

export function useReconciliationReport(month: string) {
  const path = `/api/reports/reconciliation-report${qs({ month })}`;
  return useFetch<ReconciliationReport>(path, [month]);
}

// ── Company settings ──
export function useCompany() {
  return useFetch<{ company: Company }>("/api/settings/company");
}

// ── Users ──
export function useUsers(filters: Record<string, unknown> = {}) {
  const path = `/api/settings/users${qs(filters)}`;
  return useFetch<PaginatedResponse<AppUser>>(path, [JSON.stringify(filters)]);
}

// ── Integrations ──
export function useIntegrations() {
  return useFetch<{ company: Company }>("/api/settings/company");
}

// ── Search ──
export function useSearch(query: string) {
  const path = query.length >= 2 ? `/api/search${qs({ q: query })}` : null;
  return useFetch<SearchResults>(path, [query]);
}

// ── Matching rules ──
export function useRules(filters: Record<string, unknown> = {}) {
  const path = `/api/settings/rules${qs(filters)}`;
  return useFetch<PaginatedResponse<MatchingRule>>(path, [JSON.stringify(filters)]);
}

// ── Types ──
export interface Invoice {
  id: string;
  holdedId?: string;
  number: string;
  type: string;
  issueDate: string;
  dueDate?: string;
  totalAmount: number;
  netAmount?: number;
  vatAmount?: number;
  currency: string;
  description?: string;
  status: string;
  amountPaid: number;
  amountPending?: number;
  contact?: { id: string; name: string; cif?: string };
  _count?: { reconciliations: number; payments: number };
}

export interface BankTransaction {
  id: string;
  valueDate: string;
  bookingDate?: string;
  amount: number;
  currency: string;
  concept?: string;
  conceptParsed?: string;
  counterpartIban?: string;
  counterpartName?: string;
  reference?: string;
  balanceAfter?: number;
  status: string;
  priority: string;
  detectedType?: string;
  note?: string;
  classification?: {
    id: string;
    cashflowType: string;
    description?: string;
    account: { code: string; name: string };
  };
  _count?: { reconciliations: number };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  cif: string;
  currency: string;
  autoApproveThreshold: number;
  materialityThreshold: number;
  integrations?: Integration[];
  _count?: Record<string, number>;
}

export interface Integration {
  id: string;
  type: string;
  status: string;
  lastSyncAt?: string;
  syncFrequency: string;
}

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  lastLoginAt?: string;
}

export interface PyGReport {
  period: { from: string; to: string };
  lines: PyGLine[];
  ebitda?: number;
  summary: {
    operatingResult: number;
    financialResult: number;
    resultBeforeTax: number;
    netResult: number;
  };
}

export interface PyGLine {
  code: string;
  label: string;
  amount: number;
  level: number;
  isTotal?: boolean;
  children?: PyGLine[];
}

export interface CashflowReport {
  period: { from: string; to: string };
  mode: string;
  months: CashflowMonth[];
  totals: Record<string, number>;
}

export interface CashflowMonth {
  month: string;
  openingBalance: number;
  closingBalance: number;
  entries: CashflowEntry[];
  totalInflows: number;
  totalOutflows: number;
  netChange: number;
}

export interface CashflowEntry {
  category: string;
  label: string;
  amount: number;
}

export interface ReconciliationReport {
  period: string;
  holdedBalance: number;
  bankBalance: number;
  difference: number;
  holdedItems: ReconciliationItem[];
  bankItems: ReconciliationItem[];
}

export interface ReconciliationItem {
  id: string;
  date: string;
  concept: string;
  amount: number;
  status?: string;
}

export interface SearchResults {
  invoices: Invoice[];
  transactions: BankTransaction[];
  contacts: { id: string; name: string; cif?: string; type: string }[];
}

export interface MatchingRule {
  id: string;
  type: string;
  isActive: boolean;
  timesApplied: number;
  pattern?: string;
  counterpartIban?: string;
  action: string;
  accountCode?: string;
  cashflowType?: string;
}
