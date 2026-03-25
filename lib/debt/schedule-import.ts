/**
 * Schedule import and validation.
 *
 * Parses and validates an imported amortization schedule,
 * checking that principal sums match, dates are chronological,
 * and each row's total = principal + interest.
 */

export interface ImportedScheduleRow {
  entryNumber: number;
  dueDate: string; // ISO date
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  outstandingAfter: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an imported schedule against the instrument's principal.
 *
 * Checks:
 * 1. sum(principalAmount) ≈ principal (within 1€ tolerance)
 * 2. Dates are chronological
 * 3. Each row: totalAmount ≈ principalAmount + interestAmount
 * 4. outstandingAfter is non-negative
 * 5. Last entry outstandingAfter ≈ 0
 */
export function validateImportedSchedule(
  rows: ImportedScheduleRow[],
  principal: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    errors.push("Schedule is empty.");
    return { valid: false, errors, warnings };
  }

  // Check principal sum
  const totalPrincipal = rows.reduce((s, r) => s + r.principalAmount, 0);
  const principalDiff = Math.abs(totalPrincipal - principal);
  if (principalDiff > 1) {
    errors.push(
      `Sum of principal amounts (${totalPrincipal.toFixed(2)}) differs from instrument principal (${principal.toFixed(2)}) by ${principalDiff.toFixed(2)}.`
    );
  } else if (principalDiff > 0.01) {
    warnings.push(`Minor rounding difference in principal sum: ${principalDiff.toFixed(2)}€.`);
  }

  // Check chronological dates
  let prevDate: Date | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = new Date(row.dueDate);

    if (isNaN(date.getTime())) {
      errors.push(`Row ${row.entryNumber}: invalid date "${row.dueDate}".`);
      continue;
    }

    if (prevDate && date <= prevDate) {
      errors.push(`Row ${row.entryNumber}: date ${row.dueDate} is not after previous date.`);
    }
    prevDate = date;

    // Check total = principal + interest
    const expectedTotal = round2(row.principalAmount + row.interestAmount);
    if (Math.abs(row.totalAmount - expectedTotal) > 0.02) {
      errors.push(
        `Row ${row.entryNumber}: totalAmount (${row.totalAmount}) != principal (${row.principalAmount}) + interest (${row.interestAmount}) = ${expectedTotal}.`
      );
    }

    // Check non-negative outstanding
    if (row.outstandingAfter < -0.01) {
      errors.push(
        `Row ${row.entryNumber}: outstandingAfter (${row.outstandingAfter}) is negative.`
      );
    }
  }

  // Check last entry outstanding ≈ 0
  const lastRow = rows[rows.length - 1];
  if (lastRow.outstandingAfter > 1) {
    warnings.push(`Last entry has outstanding balance of ${lastRow.outstandingAfter.toFixed(2)}€.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
