/**
 * Shared API response types — used by both backend routes and frontend hooks.
 * Derived from Prisma types to stay in sync with the schema.
 */

import type {
  Invoice as PrismaInvoice,
  BankTransaction as PrismaBankTransaction,
  Notification as PrismaNotification,
  Company as PrismaCompany,
  User as PrismaUser,
  Integration as PrismaIntegration,
  MatchingRule as PrismaMatchingRule,
} from "@prisma/client";

// ── Invoice ──
export type InvoiceResponse = Pick<
  PrismaInvoice,
  "id" | "holdedId" | "number" | "type" | "issueDate" | "dueDate" |
  "totalAmount" | "netAmount" | "vatAmount" | "currency" | "description" |
  "status" | "amountPaid" | "amountPending" | "pdfUrl"
> & {
  contact?: { id: string; name: string; cif?: string | null } | null;
  _count?: { reconciliations: number; payments: number };
};

// ── BankTransaction ──
export type BankTransactionResponse = Pick<
  PrismaBankTransaction,
  "id" | "valueDate" | "bookingDate" | "amount" | "currency" |
  "concept" | "conceptParsed" | "counterpartIban" | "counterpartName" |
  "reference" | "balanceAfter" | "status" | "priority" | "detectedType" | "note"
> & {
  classification?: {
    id: string;
    cashflowType: string;
    description?: string | null;
    account: { code: string; name: string };
  } | null;
  _count?: { reconciliations: number };
};

// ── Notification ──
export type NotificationResponse = Pick<
  PrismaNotification,
  "id" | "type" | "title" | "body" | "isRead" | "actionUrl" | "createdAt"
>;

// ── Company ──
export type CompanyResponse = Pick<
  PrismaCompany,
  "id" | "name" | "cif" | "currency" | "autoApproveThreshold" |
  "materialityThreshold" | "materialityMinor" | "preAlertDays"
> & {
  integrations?: IntegrationResponse[];
  _count?: Record<string, number>;
};

// ── Integration ──
export type IntegrationResponse = Pick<
  PrismaIntegration,
  "id" | "type" | "status" | "lastSyncAt" | "syncFrequency"
>;

// ── User ──
export type AppUserResponse = Pick<
  PrismaUser,
  "id" | "email" | "name" | "role" | "status" | "lastLoginAt"
>;

// ── MatchingRule ──
export type MatchingRuleResponse = Pick<
  PrismaMatchingRule,
  "id" | "type" | "isActive" | "timesApplied" | "pattern" |
  "counterpartIban" | "action" | "accountCode" | "cashflowType" |
  "name" | "origin" | "status" | "priority"
>;

// ── Paginated Response ──
export interface PaginatedApiResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ── Report types ──

export interface PyGLineDetail {
  code: string;
  label: string;
  amount: number;
  percentOverRevenue: number | null;
  children?: PyGLineDetail[];
}

export interface PyGReport {
  companyId: string;
  from: string;
  to: string;
  level: string;
  currency: string;
  lines: PyGLineDetail[];
  results: {
    resultadoExplotacion: number;
    resultadoFinanciero: number;
    resultadoAntesImpuestos: number;
    resultadoEjercicio: number;
    ebitda: number | null;
  };
}

export interface ReconciliationReportResponse {
  period: string;
  holdedBalance: number;
  bankBalance: number;
  difference: number;
  holdedItems?: { id: string; date: string; concept: string; amount: number; status?: string }[];
  bankItems?: { id: string; date: string; concept: string; amount: number; status?: string }[];
}

export interface SearchResultsResponse {
  invoices: InvoiceResponse[];
  transactions: BankTransactionResponse[];
  contacts: { id: string; name: string; cif?: string | null; type: string }[];
}
