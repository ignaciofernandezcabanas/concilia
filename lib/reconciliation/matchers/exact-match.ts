/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction, Invoice, Contact } from "@prisma/client";

export interface ExactMatchResult {
  invoice: Invoice & { contact: Contact | null };
  confidence: number;
  matchReason: string;
}

export interface SupportingDocMatchResult {
  type: "EXACT_MATCH";
  confidence: number;
  supportingDocumentId: string;
  matchReason: string;
}

/**
 * Finds invoices that exactly match a bank transaction by amount and contact.
 *
 * Matching criteria:
 * - Invoice totalAmount equals abs(tx.amount)
 * - Contact identified by CIF or IBAN matching the tx counterpart
 * - ISSUED invoices for positive amounts (income), RECEIVED for negative (expenses)
 * - Invoice must be in a payable status (PENDING, PARTIAL, OVERDUE)
 *
 * Returns matches sorted by date proximity, with confidence 0.95-0.99.
 */
export async function findExactMatch(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<ExactMatchResult[]> {
  const absAmount = Math.abs(tx.amount);
  const isIncome = tx.amount > 0;

  // Determine invoice type based on transaction direction
  const invoiceTypes = isIncome
    ? (["ISSUED", "CREDIT_RECEIVED"] as const)
    : (["RECEIVED", "CREDIT_ISSUED"] as const);

  // Build contact filter based on available counterpart information
  const contactFilters: Record<string, unknown>[] = [];

  if (tx.counterpartIban) {
    const normalizedIban = tx.counterpartIban.replace(/\s/g, "").toUpperCase();
    contactFilters.push({ iban: normalizedIban });
  }

  // Try matching counterpart name against contact CIF
  // (banks sometimes put the CIF in the counterpart name field)
  if (tx.counterpartName) {
    const cifPattern = tx.counterpartName.replace(/\s/g, "").toUpperCase();
    // Spanish CIF/NIF pattern: letter + 8 digits or 8 digits + letter
    if (/^[A-Z]\d{7,8}[A-Z0-9]?$/.test(cifPattern) || /^\d{8}[A-Z]$/.test(cifPattern)) {
      contactFilters.push({ cif: cifPattern });
    }
  }

  if (contactFilters.length === 0) {
    // Without contact identification, we cannot do an exact match
    return [];
  }

  // Find matching contacts
  const contacts = await db.contact.findMany({
    where: {
      OR: contactFilters,
    },
  });

  if (contacts.length === 0) {
    return [];
  }

  const contactIds = contacts.map((c) => c.id);

  // Find invoices that match amount, type, contact, and are pending payment
  const invoices = await db.invoice.findMany({
    where: {
      contactId: { in: contactIds },
      type: { in: [...invoiceTypes] },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      totalAmount: absAmount,
    },
    include: {
      contact: true,
    },
    orderBy: { issueDate: "desc" },
  });

  // If no exact EUR match, try cross-currency match with 2% tolerance
  if (invoices.length === 0) {
    const txCurrency = (tx as any).originalCurrency ?? "EUR";
    const FX_TOLERANCE = 0.02;
    const amountMin = absAmount * (1 - FX_TOLERANCE);
    const amountMax = absAmount * (1 + FX_TOLERANCE);

    const fxCandidates = await db.invoice.findMany({
      where: {
        contactId: { in: contactIds },
        type: { in: [...invoiceTypes] },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        totalAmount: { gte: amountMin, lte: amountMax },
      },
      include: {
        contact: true,
      },
      orderBy: { issueDate: "desc" },
    });

    // Only consider candidates where currencies actually differ
    const crossCurrencyMatches = fxCandidates.filter((inv) => {
      const invCurrency = (inv as any).originalCurrency ?? inv.currency ?? "EUR";
      return invCurrency !== txCurrency || (invCurrency !== "EUR" && txCurrency !== "EUR");
    });

    if (crossCurrencyMatches.length > 0) {
      const txDate = tx.valueDate.getTime();
      return crossCurrencyMatches.map((invoice) => {
        const daysDiff = Math.abs((invoice.issueDate.getTime() - txDate) / (24 * 60 * 60 * 1000));
        const dateProximityBonus = Math.max(0, 0.04 * (1 - daysDiff / 365));
        // Cross-currency exact matches get slightly lower confidence (0.90-0.94)
        const confidence = Math.min(0.94, 0.9 + dateProximityBonus);
        return {
          invoice,
          confidence: Math.round(confidence * 100) / 100,
          matchReason: "exact_amount_fx_tolerance",
        };
      });
    }

    return [];
  }

  // Score and sort by date proximity to the transaction
  const txDate = tx.valueDate.getTime();

  const scored = invoices.map((invoice) => {
    const daysDiff = Math.abs((invoice.issueDate.getTime() - txDate) / (24 * 60 * 60 * 1000));

    // Confidence ranges from 0.95 to 0.99 based on date proximity
    // Perfect date match = 0.99, further away = lower confidence
    const dateProximityBonus = Math.max(0, 0.04 * (1 - daysDiff / 365));
    const confidence = Math.min(0.99, 0.95 + dateProximityBonus);

    // Build match reason
    const matchReasonParts: string[] = ["exact_amount"];

    const matchedContact = contacts.find((c) => c.id === invoice.contactId);
    if (matchedContact) {
      if (
        tx.counterpartIban &&
        matchedContact.iban?.replace(/\s/g, "").toUpperCase() ===
          tx.counterpartIban.replace(/\s/g, "").toUpperCase()
      ) {
        matchReasonParts.push("iban_match");
      }
      if (matchedContact.cif) {
        matchReasonParts.push("cif_match");
      }
    }

    return {
      invoice,
      confidence: Math.round(confidence * 100) / 100,
      matchReason: matchReasonParts.join("+"),
    };
  });

  // Sort by confidence descending, then by date proximity
  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const aDiff = Math.abs(a.invoice.issueDate.getTime() - txDate);
    const bDiff = Math.abs(b.invoice.issueDate.getTime() - txDate);
    return aDiff - bDiff;
  });

  return scored;
}

/**
 * Searches for SupportingDocuments that match a bank transaction by amount
 * and expected direction. Used as a fallback when no invoice match is found.
 */
export async function findSupportingDocMatch(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<SupportingDocMatchResult | null> {
  const expectedDirection = tx.amount > 0 ? "INFLOW" : "OUTFLOW";
  const absAmount = Math.abs(tx.amount);

  const txDate = tx.valueDate;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const minDate = new Date(txDate.getTime() - ninetyDaysMs);
  const maxDate = new Date(txDate.getTime() + ninetyDaysMs);

  const docMatches =
    (await (db as any).supportingDocument
      ?.findMany?.({
        where: {
          status: "POSTED",
          expectedDirection,
          expectedAmount: {
            gte: absAmount * 0.99,
            lte: absAmount * 1.01,
          },
          date: {
            gte: minDate,
            lte: maxDate,
          },
        },
      })
      .catch(() => [])) ?? [];

  const unreconciledDocs = docMatches.filter((d: any) => d.status !== "RECONCILED");

  if (unreconciledDocs.length === 1) {
    return {
      type: "EXACT_MATCH",
      confidence: 0.93,
      supportingDocumentId: unreconciledDocs[0].id,
      matchReason: `Documento soporte: ${unreconciledDocs[0].description}`,
    };
  }

  return null;
}
