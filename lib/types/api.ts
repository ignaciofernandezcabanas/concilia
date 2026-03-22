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
  "reference" | "balanceAfter" | "status" | "priority" | "detectedType" | "note" | "duplicateGroupId"
> & {
  classification?: {
    id: string;
    cashflowType: string;
    description?: string | null;
    account: { code: string; name: string };
  } | null;
  reconciliation?: {
    id: string;
    type: string;
    confidenceScore: number | null;
    matchReason: string | null;
    difference: number | null;
    differenceReason: string | null;
    resolution: string | null;
    invoiceId: string | null;
    invoiceAmount: number | null;
    bankAmount: number | null;
    invoice?: {
      id: string;
      number: string;
      totalAmount: number;
      contact?: { name: string } | null;
    } | null;
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
  month: string;
  saldoHolded: number;
  saldoBanco: number;
  diferencia: number;
  unreconciledInvoices?: { invoiceId: string; number: string; type: string; issueDate: string; totalAmount: number; amountPending: number; contactName: string; status: string }[];
  unreconciledTransactions?: { transactionId: string; valueDate: string; concept: string; amount: number; counterpartName: string; status: string }[];
}

export interface DashboardResponse {
  income: number;
  expenses: number;
  cashflow: number;
  pendingCount: number;
  reconciled: { count: number; amount: number };
  pendingMatch: { count: number; amount: number };
  unclassified: { count: number; amount: number };
}

export interface SearchResultsResponse {
  invoices: InvoiceResponse[];
  transactions: BankTransactionResponse[];
  contacts: { id: string; name: string; cif?: string | null; type: string }[];
}
