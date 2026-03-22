/**
 * Test factories for all main models.
 * Each factory returns a complete object with realistic defaults.
 * Use overrides to customize specific fields.
 */

import type { BankTransaction, Invoice, Company, Contact, Reconciliation, MatchingRule, LearnedPattern } from "@prisma/client";

const DEFAULT_COMPANY_ID = "company_1";
const DEFAULT_CONTACT_ID = "contact_1";
const DEFAULT_CONTACT_IBAN = "ES7620770024003102575766";
const DEFAULT_CONTACT_CIF = "B12345678";

// ── Company ──
export function buildCompany(overrides: Record<string, unknown> = {}): Company {
  return {
    id: DEFAULT_COMPANY_ID,
    name: "Test Company S.L.",
    cif: "B98765432",
    currency: "EUR",
    fiscalYearStartMonth: 1,
    numberFormat: "eu",
    csvSeparator: ";",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    autoApproveThreshold: 0.90,
    materialityThreshold: 500,
    materialityMinor: 5,
    preAlertDays: 7,
    ...overrides,
  } as Company;
}

// ── Contact ──
export function buildContact(overrides: Record<string, unknown> = {}): Contact {
  return {
    id: DEFAULT_CONTACT_ID,
    holdedId: null,
    name: "Proveedor Test S.L.",
    cif: DEFAULT_CONTACT_CIF,
    iban: DEFAULT_CONTACT_IBAN,
    type: "SUPPLIER" as const,
    avgPaymentDays: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    companyId: DEFAULT_COMPANY_ID,
    ...overrides,
  } as Contact;
}

// ── Invoice ──
export function buildInvoice(overrides: Record<string, unknown> = {}): Invoice & { contact: Contact } {
  return {
    id: "invoice_1",
    holdedId: null,
    number: "FRA-2026-001",
    type: "RECEIVED" as const,
    issueDate: new Date("2026-03-01"),
    dueDate: new Date("2026-04-01"),
    totalAmount: 1000.00,
    netAmount: 826.45,
    vatAmount: 173.55,
    currency: "EUR",
    description: "Servicio de consultoría",
    status: "PENDING" as const,
    amountPaid: 0,
    amountPending: 1000.00,
    provisionedAmount: 0,
    provisionType: null,
    pdfUrl: null,
    driveFileId: null,
    creditNoteForId: null,
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
    syncedAt: null,
    companyId: DEFAULT_COMPANY_ID,
    contactId: DEFAULT_CONTACT_ID,
    contact: buildContact(),
    ...overrides,
  } as Invoice & { contact: Contact };
}

// ── BankTransaction ──
export function buildBankTransaction(overrides: Record<string, unknown> = {}): BankTransaction {
  return {
    id: "tx_1",
    externalId: "csv_2026-03-15_-1000.00_47254.02",
    valueDate: new Date("2026-03-15"),
    bookingDate: new Date("2026-03-15"),
    amount: -1000.00,
    currency: "EUR",
    concept: "TRANSF PROVEEDOR TEST SL",
    conceptParsed: null,
    counterpartIban: DEFAULT_CONTACT_IBAN,
    counterpartName: "PROVEEDOR TEST SL",
    reference: null,
    balanceAfter: 47254.02,
    status: "PENDING" as const,
    priority: "ROUTINE" as const,
    detectedType: null as string | null,
    classificationId: null,
    note: null,
    noteAuthorId: null,
    noteCreatedAt: null,
    reminderDate: null,
    createdAt: new Date("2026-03-15"),
    updatedAt: new Date("2026-03-15"),
    syncedAt: null,
    companyId: DEFAULT_COMPANY_ID,
    duplicateGroupId: null,
    ...overrides,
  } as BankTransaction;
}

// ── Reconciliation ──
export function buildReconciliation(overrides: Record<string, unknown> = {}): Reconciliation {
  return {
    id: "reco_1",
    type: "EXACT_MATCH" as const,
    confidenceScore: 0.95,
    matchReason: "exact_amount+iban_match",
    status: "PROPOSED" as const,
    invoiceAmount: 1000.00,
    bankAmount: 1000.00,
    difference: null as number | null,
    differenceReason: null as string | null,
    differenceAccountId: null,
    resolvedAt: null as Date | null,
    resolvedById: null as string | null,
    resolution: null as string | null,
    bankTransactionId: "tx_1",
    invoiceId: "invoice_1",
    companyId: DEFAULT_COMPANY_ID,
    createdAt: new Date("2026-03-15"),
    updatedAt: new Date("2026-03-15"),
    ...overrides,
  } as Reconciliation;
}

// ── MatchingRule ──
export function buildMatchingRule(overrides: Record<string, unknown> = {}): MatchingRule {
  return {
    id: "rule_1",
    name: null as string | null,
    type: "IBAN_CLASSIFY" as const,
    origin: "MANUAL" as const,
    status: "ACTIVE" as const,
    priority: 0,
    isActive: true,
    timesApplied: 0,
    lastExecutedAt: null as Date | null,
    pattern: null as string | null,
    counterpartIban: DEFAULT_CONTACT_IBAN,
    counterpartName: null as string | null,
    contactId: null as string | null,
    conceptContains: null as string | null,
    minAmount: null as number | null,
    maxAmount: null as number | null,
    transactionDirection: null as string | null,
    differencePercentMin: null as number | null,
    differencePercentMax: null as number | null,
    action: "classify",
    accountCode: "629",
    cashflowType: "OPERATING" as const,
    differenceReason: null as string | null,
    companyId: DEFAULT_COMPANY_ID,
    createdAt: new Date("2026-01-01"),
    createdById: null as string | null,
    ...overrides,
  } as MatchingRule;
}

// ── LearnedPattern ──
export function buildLearnedPattern(overrides: Record<string, unknown> = {}): LearnedPattern {
  return {
    id: "pattern_1",
    type: "difference_reason",
    isActive: true,
    status: "SUGGESTED" as const,
    counterpartIban: DEFAULT_CONTACT_IBAN,
    counterpartName: "Proveedor Test S.L.",
    conceptPattern: null as string | null,
    amountRange: null as string | null,
    dayOfMonthRange: null as string | null,
    predictedAction: "BANK_COMMISSION",
    predictedReason: "BANK_COMMISSION",
    predictedAccount: null as string | null,
    occurrences: 5,
    correctPredictions: 4,
    confidence: 0.80,
    supervisedApplyCount: 0,
    promotedToRuleId: null as string | null,
    reviewedAt: null as Date | null,
    reviewedById: null as string | null,
    companyId: DEFAULT_COMPANY_ID,
    createdAt: new Date("2026-02-01"),
    updatedAt: new Date("2026-03-01"),
    ...overrides,
  } as LearnedPattern;
}
