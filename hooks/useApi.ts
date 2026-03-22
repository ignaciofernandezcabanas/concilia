"use client";

import { useState, useEffect, useCallback } from "react";
import { api, qs, ApiError } from "@/lib/api-client";

// Re-export shared types for convenience
export type {
  InvoiceResponse as Invoice,
  BankTransactionResponse as BankTransaction,
  NotificationResponse as Notification,
  CompanyResponse as Company,
  IntegrationResponse as Integration,
  AppUserResponse as AppUser,
  MatchingRuleResponse as MatchingRule,
  PaginatedApiResponse as PaginatedResponse,
  PyGReport,
  PyGLineDetail,
  ReconciliationReportResponse as ReconciliationReport,
  SearchResultsResponse as SearchResults,
} from "@/lib/types/api";

import type {
  InvoiceResponse,
  BankTransactionResponse,
  NotificationResponse,
  CompanyResponse,
  AppUserResponse,
  MatchingRuleResponse,
  PaginatedApiResponse,
  PyGReport,
  ReconciliationReportResponse,
  SearchResultsResponse,
} from "@/lib/types/api";

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

// ── Typed hooks ──

export function useInvoices(filters: Record<string, unknown> = {}) {
  return useFetch<PaginatedApiResponse<InvoiceResponse>>(
    `/api/invoices${qs(filters)}`, [JSON.stringify(filters)]
  );
}

export function useTransactions(filters: Record<string, unknown> = {}) {
  return useFetch<PaginatedApiResponse<BankTransactionResponse>>(
    `/api/transactions${qs(filters)}`, [JSON.stringify(filters)]
  );
}

export function useNotifications(filters: Record<string, unknown> = {}) {
  return useFetch<PaginatedApiResponse<NotificationResponse>>(
    `/api/notifications${qs(filters)}`, [JSON.stringify(filters)]
  );
}

export function usePyG(from: string, to: string, level = 3) {
  return useFetch<PyGReport>(`/api/reports/pyg${qs({ from, to, level })}`, [from, to, level]);
}

export function useReconciliationReport(month: string) {
  return useFetch<ReconciliationReportResponse>(
    `/api/reports/reconciliation-report${qs({ month })}`, [month]
  );
}

export function useCompany() {
  return useFetch<{ company: CompanyResponse }>("/api/settings/company");
}

export function useUsers(filters: Record<string, unknown> = {}) {
  return useFetch<PaginatedApiResponse<AppUserResponse>>(
    `/api/settings/users${qs(filters)}`, [JSON.stringify(filters)]
  );
}

export function useSearch(query: string) {
  const path = query.length >= 2 ? `/api/search${qs({ q: query })}` : null;
  return useFetch<SearchResultsResponse>(path, [query]);
}

export function useRules(filters: Record<string, unknown> = {}) {
  return useFetch<PaginatedApiResponse<MatchingRuleResponse>>(
    `/api/settings/rules${qs(filters)}`, [JSON.stringify(filters)]
  );
}
