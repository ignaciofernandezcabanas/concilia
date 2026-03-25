/**
 * French amortization schedule generator (cuota constante).
 *
 * Computes a full repayment schedule given principal, rate, term,
 * optional grace period, start date and payment day.
 */

export interface ScheduleEntry {
  entryNumber: number;
  dueDate: Date;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  outstandingAfter: number;
}

export interface ScheduleInput {
  principal: number;
  annualRate: number; // e.g. 5.0 for 5%
  termMonths: number;
  graceMonths?: number;
  startDate: Date;
  paymentDay: number; // 1-28
}

/**
 * Generate a French (annuity) amortization schedule.
 *
 * During grace period: interest-only payments.
 * After grace: constant total payment (principal + interest) for remaining months.
 * Last payment is adjusted to zero the balance exactly.
 */
export function generateAmortizationSchedule(input: ScheduleInput): ScheduleEntry[] {
  const { principal, annualRate, termMonths, startDate, paymentDay } = input;
  const graceMonths = input.graceMonths ?? 0;
  const monthlyRate = annualRate / 100 / 12;
  const entries: ScheduleEntry[] = [];

  let outstanding = principal;
  let entryNumber = 1;

  // Helper: compute due date for entry N (1-based)
  function dueDate(n: number): Date {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + n);
    // Clamp paymentDay to valid range for the month
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(paymentDay, lastDay));
    return d;
  }

  // Grace period: interest-only
  for (let i = 0; i < graceMonths; i++) {
    const interest = round2(outstanding * monthlyRate);
    entries.push({
      entryNumber,
      dueDate: dueDate(entryNumber),
      principalAmount: 0,
      interestAmount: interest,
      totalAmount: interest,
      outstandingAfter: outstanding,
    });
    entryNumber++;
  }

  // Amortizing period
  const amortMonths = termMonths - graceMonths;
  if (amortMonths <= 0) return entries;

  // Constant payment (French system)
  const payment =
    monthlyRate === 0
      ? round2(outstanding / amortMonths)
      : round2((outstanding * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -amortMonths)));

  for (let i = 0; i < amortMonths; i++) {
    const interest = round2(outstanding * monthlyRate);
    const isLast = i === amortMonths - 1;

    let principalPart: number;
    let total: number;

    if (isLast) {
      // Last payment: adjust to zero balance
      principalPart = round2(outstanding);
      total = round2(principalPart + interest);
    } else {
      principalPart = round2(payment - interest);
      total = payment;
    }

    outstanding = round2(outstanding - principalPart);
    // Guard against floating-point negative zero
    if (outstanding < 0) outstanding = 0;

    entries.push({
      entryNumber,
      dueDate: dueDate(entryNumber),
      principalAmount: principalPart,
      interestAmount: interest,
      totalAmount: total,
      outstandingAfter: outstanding,
    });
    entryNumber++;
  }

  return entries;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
