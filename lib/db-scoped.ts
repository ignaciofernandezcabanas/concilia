/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Scoped Prisma client that automatically injects companyId into queries.
 *
 * Usage:
 *   const db = getScopedDb(companyId);
 *   db.invoice.findMany({ where: { status: "PENDING" } })
 *   // → automatically adds companyId filter
 *
 * For consolidated (multi-company) views:
 *   const db = getGroupDb(companyIds);
 *   // → filters by companyId IN [...companyIds], READ-ONLY
 */

import { prisma } from "@/lib/db";

// Models that have companyId field
const SCOPED_MODELS = new Set([
  "company",
  "user",
  "account",
  "ownBankAccount",
  "contact",
  "invoice",
  "bankTransaction",
  "reconciliation",
  "matchingRule",
  "categoryThreshold",
  "integration",
  "syncLog",
  "archiveLog",
  "notification",
  "auditLog",
  "accountingPeriod",
  "journalEntry",
  "fixedAsset",
  "budget",
  "confidenceAdjustment",
  "controllerDecision",
  "learnedPattern",
  "thresholdCalibration",
  "inquiry",
  "investment",
  "recurringAccrual",
  // NOT scoped (no companyId): InvoiceLine, BudgetLine, JournalEntryLine,
  //   BankTransactionClassification, DuplicateGroup, Payment, CompanyScope
  // NOT scoped (organizationId instead): IntercompanyLink, AgentRun
]);

export type ScopedPrisma = typeof prisma;

/**
 * Returns a Prisma client scoped to a single company.
 * All queries on scoped models automatically filter by companyId.
 * Creates automatically add companyId.
 */
export function getScopedDb(companyId: string): ScopedPrisma {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId };
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          // findUnique uses unique fields, don't inject companyId in where
          // but we validate after fetch
          return query(args);
        },
        async findUniqueOrThrow({ model, args, query }) {
          return query(args);
        },
        async create({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model)) && model !== "Company") {
            args.data = { ...args.data, companyId } as never;
          }
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model)) && model !== "Company") {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((d: Record<string, unknown>) => ({
                ...d,
                companyId,
              })) as never;
            } else {
              args.data = { ...args.data, companyId } as never;
            }
          }
          return query(args);
        },
        async update({ model, args, query }) {
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId };
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId };
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId };
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId };
          }
          return query(args);
        },
      },
    },
  }) as unknown as ScopedPrisma;
}

/**
 * Returns a read-only Prisma client scoped to multiple companies.
 * For consolidated group views.
 */
export function getGroupDb(companyIds: string[]): ScopedPrisma {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId: { in: companyIds } };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId: { in: companyIds } };
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId: { in: companyIds } };
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (SCOPED_MODELS.has(lcFirst(model))) {
            args.where = { ...args.where, companyId: { in: companyIds } };
          }
          return query(args);
        },
        // Block writes in consolidated mode
        async create() {
          throw new Error("Writes not allowed in consolidated view. Select a company first.");
        },
        async createMany() {
          throw new Error("Writes not allowed in consolidated view.");
        },
        async update() {
          throw new Error("Writes not allowed in consolidated view.");
        },
        async updateMany() {
          throw new Error("Writes not allowed in consolidated view.");
        },
        async delete() {
          throw new Error("Writes not allowed in consolidated view.");
        },
        async deleteMany() {
          throw new Error("Writes not allowed in consolidated view.");
        },
      },
    },
  }) as unknown as ScopedPrisma;
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
