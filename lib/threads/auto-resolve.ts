/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Auto-resolve condition checkers for AgentThread.
 *
 * Each checker returns true if the thread's condition has been met
 * and the thread can be automatically resolved.
 */

import type { ScopedPrisma } from "@/lib/db-scoped";

export interface AutoResolveCondition {
  type: string;
  invoiceIds?: string[];
  transactionIds?: string[];
  contactId?: string;
  deadlineDate?: string;
}

/**
 * Check if a thread's auto-resolve condition has been met.
 */
export async function checkAutoResolve(
  db: ScopedPrisma,
  condition: AutoResolveCondition | null
): Promise<{ resolved: boolean; reason?: string }> {
  if (!condition?.type) return { resolved: false };

  const checker = CHECKERS[condition.type];
  if (!checker) return { resolved: false };

  return checker(db, condition);
}

type Checker = (
  db: ScopedPrisma,
  condition: AutoResolveCondition
) => Promise<{ resolved: boolean; reason?: string }>;

const CHECKERS: Record<string, Checker> = {
  /**
   * invoice_paid: All linked invoices have paymentStatus PAID.
   */
  invoice_paid: async (db, condition) => {
    const ids = condition.invoiceIds ?? [];
    if (ids.length === 0) return { resolved: false };

    const paidCount = await db.invoice.count({
      where: { id: { in: ids }, status: { in: ["PAID"] } },
    });

    if (paidCount === ids.length) {
      return { resolved: true, reason: `Todas las facturas cobradas (${paidCount})` };
    }
    return { resolved: false };
  },

  /**
   * transaction_matched: All linked transactions have been reconciled.
   */
  transaction_matched: async (db, condition) => {
    const ids = condition.transactionIds ?? [];
    if (ids.length === 0) return { resolved: false };

    const matchedCount = await db.bankTransaction.count({
      where: { id: { in: ids }, status: "RECONCILED" },
    });

    if (matchedCount === ids.length) {
      return { resolved: true, reason: `Todos los movimientos conciliados (${matchedCount})` };
    }
    return { resolved: false };
  },

  /**
   * document_received: A recent invoice was imported from this contact.
   */
  document_received: async (db, condition) => {
    if (!condition.contactId) return { resolved: false };

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentInvoice = await db.invoice.findFirst({
      where: {
        contactId: condition.contactId,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (recentInvoice) {
      return { resolved: true, reason: `Documento recibido: ${recentInvoice.number}` };
    }
    return { resolved: false };
  },

  /**
   * balance_zero: No pending amount for this contact.
   */
  balance_zero: async (db, condition) => {
    if (!condition.contactId) return { resolved: false };

    const pendingInvoices = await db.invoice.findMany({
      where: {
        contactId: condition.contactId,
        status: { in: ["PENDING", "OVERDUE", "PARTIAL"] },
      },
      select: { amountPending: true, totalAmount: true, amountPaid: true },
    });

    const totalPending = pendingInvoices.reduce(
      (sum, inv) => sum + (inv.amountPending ?? inv.totalAmount - inv.amountPaid),
      0
    );

    if (Math.abs(totalPending) < 0.01) {
      return { resolved: true, reason: "Saldo pendiente es cero" };
    }
    return { resolved: false };
  },

  /**
   * deadline_passed: A configured deadline date has passed.
   */
  deadline_passed: async (_db, condition) => {
    if (!condition.deadlineDate) return { resolved: false };

    const deadline = new Date(condition.deadlineDate);
    if (new Date() > deadline) {
      return { resolved: true, reason: `Fecha límite alcanzada: ${condition.deadlineDate}` };
    }
    return { resolved: false };
  },
};
