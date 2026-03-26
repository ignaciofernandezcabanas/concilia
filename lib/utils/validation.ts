import { z } from "zod";

// ============================================================
// Reconciliation resolve actions (discriminated union)
// ============================================================

const approveAction = z.object({
  action: z.literal("approve"),
  reconciliationId: z.string(),
});

const rejectAction = z.object({
  action: z.literal("reject"),
  reconciliationId: z.string(),
  reason: z.string().min(1, "Rejection reason is required."),
});

const manualMatchAction = z.object({
  action: z.literal("manual_match"),
  bankTransactionId: z.string(),
  invoiceId: z.string(),
  differenceReason: z
    .enum(["BANK_COMMISSION", "EARLY_PAYMENT", "COMMERCIAL_DISCOUNT", "PARTIAL_PAYMENT", "OTHER"])
    .optional(),
  differenceAccountId: z.string().optional(),
});

const classifyAction = z.object({
  action: z.literal("classify"),
  bankTransactionId: z.string(),
  accountCode: z.string().min(1),
  cashflowType: z.enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"]),
  description: z.string().optional(),
});

const markInternalAction = z.object({
  action: z.literal("mark_internal"),
  bankTransactionId: z.string(),
  counterpartAccountIban: z.string().optional(),
});

const ignoreAction = z.object({
  action: z.literal("ignore"),
  bankTransactionId: z.string(),
  reason: z.string().min(1, "Ignore reason is required."),
});

const markDuplicateAction = z.object({
  action: z.literal("mark_duplicate"),
  bankTransactionId: z.string(),
  duplicateOfId: z.string().optional(),
});

const markLegitimateAction = z.object({
  action: z.literal("mark_legitimate"),
  duplicateGroupId: z.string(),
});

export const resolveSchema = z.discriminatedUnion("action", [
  approveAction,
  rejectAction,
  manualMatchAction,
  classifyAction,
  markInternalAction,
  ignoreAction,
  markDuplicateAction,
  markLegitimateAction,
]);

export type ResolveInput = z.infer<typeof resolveSchema>;

// ============================================================
// Invoice list filters
// ============================================================

export const invoiceFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  type: z.enum(["ISSUED", "RECEIVED", "CREDIT_ISSUED", "CREDIT_RECEIVED"]).optional(),
  status: z
    .enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "PROVISIONED", "WRITTEN_OFF", "CANCELLED"])
    .optional(),
  contactId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().max(200).optional(),
  vatRate: z.coerce.number().optional(),
  sortBy: z.enum(["issueDate", "dueDate", "totalAmount", "number"]).default("issueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type InvoiceFilters = z.infer<typeof invoiceFiltersSchema>;

// ============================================================
// Transaction list filters
// ============================================================

export const transactionFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum([
      "PENDING",
      "RECONCILED",
      "CLASSIFIED",
      "REJECTED",
      "INVESTIGATING",
      "INTERNAL",
      "DUPLICATE",
      "IGNORED",
    ])
    .optional(),
  priority: z.enum(["URGENT", "DECISION", "CONFIRMATION", "ROUTINE"]).optional(),
  detectedType: z
    .enum([
      "MATCH_SIMPLE",
      "MATCH_GROUPED",
      "MATCH_PARTIAL",
      "MATCH_DIFFERENCE",
      "EXPENSE_NO_INVOICE",
      "INTERNAL_TRANSFER",
      "FINANCIAL_OPERATION",
      "UNIDENTIFIED",
      "POSSIBLE_DUPLICATE",
      "RETURN",
      "OVERDUE_INVOICE",
      "CREDIT_NOTE",
    ])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  counterpartIban: z.string().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["valueDate", "amount", "status", "priority"]).default("valueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

// ============================================================
// P&L (PyG) report query
// ============================================================

export const pygQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  level: z.coerce.number().int().min(1).max(5).default(3),
  includeEbitda: z.coerce.boolean().default(true),
});

export type PygQuery = z.infer<typeof pygQuerySchema>;

// ============================================================
// Cashflow report query
// ============================================================

export const cashflowQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  mode: z.enum(["direct", "indirect"]).default("direct"),
});

export type CashflowQuery = z.infer<typeof cashflowQuerySchema>;

// ============================================================
// Company settings update
// ============================================================

export const companySettingsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  cif: z
    .string()
    .regex(/^[A-HJNP-SUVW]\d{7}[0-9A-J]$|^\d{8}[A-Z]$|^[XYZ]\d{7}[A-Z]$/, "CIF/NIF inválido.")
    .optional(),
  currency: z.string().length(3).default("EUR").optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  numberFormat: z.enum(["eu", "us"]).optional(),
  csvSeparator: z.enum([";", ",", "\t"]).optional(),
  autoApproveThreshold: z.number().min(0).max(1).optional(),
  materialityThreshold: z.number().min(0).optional(),
  materialityMinor: z.number().min(0).optional(),
  preAlertDays: z.number().int().min(1).max(90).optional(),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;

// ============================================================
// User invitation
// ============================================================

export const userInviteSchema = z.object({
  email: z.string().email("Invalid email address."),
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["ADMIN", "EDITOR", "READER"]).default("EDITOR"),
});

export type UserInvite = z.infer<typeof userInviteSchema>;

// ============================================================
// Manual transaction classification
// ============================================================

export const classifySchema = z.object({
  bankTransactionId: z.string(),
  accountCode: z.string().min(1, "Account code is required."),
  cashflowType: z.enum(["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "NON_CASH"]),
  description: z.string().max(500).optional(),
  createRule: z.boolean().default(false),
  rulePattern: z.string().optional(),
});

export type ClassifyInput = z.infer<typeof classifySchema>;
