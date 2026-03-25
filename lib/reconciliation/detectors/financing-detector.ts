/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Financing Detector.
 *
 * 4-step detection cascade for debt-related bank transactions:
 * 1. Bank account match: tx account = debt instrument linked account
 * 2. Schedule match: find unmatched DebtScheduleEntry within ±5 days, amount ±0.02
 * 3. Concept heuristics: keywords for loan installments, interest, leasing, etc.
 * 4. Not financing → return null
 *
 * If detected → scenario with appropriate DetectedType.
 * Discount advances always confidence 0.0 (NEVER auto-approve).
 */

import type { ScopedPrisma } from "@/lib/db-scoped";
import type { BankTransaction, DetectedType, EconomicCategory } from "@prisma/client";

export interface FinancingDetectionResult {
  isFinancing: boolean;
  detectedType: DetectedType | null;
  economicCategory: EconomicCategory | null;
  confidence: number;
  matchReason: string | null;
  debtInstrumentId: string | null;
  scheduleEntryId: string | null;
  principalSplit: number | null;
  interestSplit: number | null;
}

const EMPTY: FinancingDetectionResult = {
  isFinancing: false,
  detectedType: null,
  economicCategory: null,
  confidence: 0,
  matchReason: null,
  debtInstrumentId: null,
  scheduleEntryId: null,
  principalSplit: null,
  interestSplit: null,
};

export async function detectFinancing(
  tx: BankTransaction,
  db: ScopedPrisma
): Promise<FinancingDetectionResult> {
  const concept = (tx.concept ?? "").toUpperCase();
  const absTx = Math.abs(tx.amount);

  // ── Step 1: Bank account match ──
  // Check if the tx counterpart IBAN matches a debt instrument's linked bank account
  if (tx.counterpartIban) {
    const instruments = await (db as any).debtInstrument.findMany({
      where: { status: "ACTIVE" },
      include: { bankAccount: true },
    });

    for (const inst of instruments) {
      if (!inst.bankAccount) continue;
      const instIban = inst.bankAccount.iban.replace(/\s/g, "");
      const txIban = tx.counterpartIban.replace(/\s/g, "");
      if (instIban !== txIban) continue;

      // Found a matching instrument
      const isDrawdown = tx.amount > 0;
      const isRevolving = inst.type === "REVOLVING_CREDIT" || inst.type === "OVERDRAFT";

      if (isRevolving) {
        return {
          isFinancing: true,
          detectedType: isDrawdown ? "CREDIT_LINE_DRAWDOWN" : "CREDIT_LINE_REPAYMENT",
          economicCategory: isDrawdown ? "FINANCING_DRAWDOWN" : "FINANCING_REPAYMENT",
          confidence: 0.9,
          matchReason: `bank_account_match:${inst.id}:${inst.name}`,
          debtInstrumentId: inst.id,
          scheduleEntryId: null,
          principalSplit: null,
          interestSplit: null,
        };
      }

      // Term loan — check if drawdown or repayment
      if (isDrawdown) {
        return {
          isFinancing: true,
          detectedType: "CREDIT_LINE_DRAWDOWN",
          economicCategory: "FINANCING_DRAWDOWN",
          confidence: 0.9,
          matchReason: `bank_account_match:${inst.id}:drawdown`,
          debtInstrumentId: inst.id,
          scheduleEntryId: null,
          principalSplit: null,
          interestSplit: null,
        };
      }

      // Outflow from term loan account — likely installment, try schedule match first
      // Fall through to step 2
    }
  }

  // ── Step 2: Schedule match ──
  // Find unmatched DebtScheduleEntry within ±5 days and amount ±0.02
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const scheduleEntries = await (db as any).debtScheduleEntry.findMany({
    where: {
      matched: false,
      dueDate: {
        gte: new Date(tx.valueDate.getTime() - fiveDaysMs),
        lte: new Date(tx.valueDate.getTime() + fiveDaysMs),
      },
    },
    include: { debtInstrument: true },
  });

  for (const entry of scheduleEntries) {
    if (Math.abs(entry.totalAmount - absTx) <= 0.02) {
      return {
        isFinancing: true,
        detectedType: "LOAN_INSTALLMENT",
        economicCategory: "FINANCING_REPAYMENT",
        confidence: 0.95,
        matchReason: `schedule_match:${entry.debtInstrumentId}:entry_${entry.entryNumber}`,
        debtInstrumentId: entry.debtInstrumentId,
        scheduleEntryId: entry.id,
        principalSplit: entry.principalAmount,
        interestSplit: entry.interestAmount,
      };
    }
  }

  // ── Step 3: Concept heuristics ──

  // Loan installment
  if (/CUOTA|AMORT(?:IZACION)?.*PREST|PREST.*AMORT|CUOTA\s*MENSUAL/.test(concept)) {
    return {
      isFinancing: true,
      detectedType: "LOAN_INSTALLMENT",
      economicCategory: "FINANCING_REPAYMENT",
      confidence: 0.75,
      matchReason: "concept_heuristic:loan_installment",
      debtInstrumentId: null,
      scheduleEntryId: null,
      principalSplit: null,
      interestSplit: null,
    };
  }

  // Interest settlement
  if (/LIQUIDACION\s*INTER|LIQ\.\s*INT|INTERESES\s*(DEUDOR|PREST)/.test(concept)) {
    return {
      isFinancing: true,
      detectedType: "INTEREST_SETTLEMENT",
      economicCategory: "FINANCING_INTEREST",
      confidence: 0.8,
      matchReason: "concept_heuristic:interest_settlement",
      debtInstrumentId: null,
      scheduleEntryId: null,
      principalSplit: null,
      interestSplit: absTx,
    };
  }

  // Discount advance — NEVER auto-approve
  if (/DESCUENTO\s*EFECTO|ANTICIPO\s*FACTURA|DESC\.\s*PAGARE/.test(concept)) {
    return {
      isFinancing: true,
      detectedType: "DISCOUNT_ADVANCE",
      economicCategory: "FINANCING_DISCOUNT_ADV",
      confidence: 0.0,
      matchReason: "concept_heuristic:discount_advance",
      debtInstrumentId: null,
      scheduleEntryId: null,
      principalSplit: null,
      interestSplit: null,
    };
  }

  // Discount settlement
  if (/VENCIMIENTO\s*DESCUENTO|EFECTO\s*VENCIDO|LIQUIDACION\s*DESCUENTO/.test(concept)) {
    return {
      isFinancing: true,
      detectedType: "DISCOUNT_SETTLEMENT",
      economicCategory: "FINANCING_DISCOUNT_SET",
      confidence: 0.8,
      matchReason: "concept_heuristic:discount_settlement",
      debtInstrumentId: null,
      scheduleEntryId: null,
      principalSplit: null,
      interestSplit: null,
    };
  }

  // Leasing
  if (/LEASING|ARRENDAMIENTO\s*FINANCIER/.test(concept)) {
    return {
      isFinancing: true,
      detectedType: "LEASE_INSTALLMENT",
      economicCategory: "FINANCING_LEASE_PAYMENT",
      confidence: 0.8,
      matchReason: "concept_heuristic:lease_installment",
      debtInstrumentId: null,
      scheduleEntryId: null,
      principalSplit: null,
      interestSplit: null,
    };
  }

  // Commissions on debt
  if (/COMISION\s*AVAL|COMISION\s*APERTURA|COM\.\s*DISP|COMISION\s*ESTUDIO/.test(concept)) {
    return {
      isFinancing: true,
      detectedType: "DEBT_COMMISSION",
      economicCategory: "FINANCING_COMMISSION",
      confidence: 0.75,
      matchReason: "concept_heuristic:debt_commission",
      debtInstrumentId: null,
      scheduleEntryId: null,
      principalSplit: null,
      interestSplit: null,
    };
  }

  // ── Step 4: Not financing ──
  return EMPTY;
}
