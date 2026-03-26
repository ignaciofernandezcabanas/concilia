import { Page } from "@playwright/test";

/**
 * Check the checkbox in the nth table row (0-indexed).
 */
export async function selectCheckboxInRow(page: Page, rowIndex: number) {
  const checkbox = page.locator("tbody tr").nth(rowIndex).locator('input[type="checkbox"]');
  await checkbox.check();
}

/**
 * Check the "select all" header checkbox.
 */
export async function selectAllCheckboxes(page: Page) {
  const headerCheckbox = page.locator('input[type="checkbox"]').first();
  await headerCheckbox.check();
}

/**
 * Click the nth table row (0-indexed).
 */
export async function clickRowByIndex(page: Page, index: number) {
  await page.locator("tbody tr").nth(index).click();
}

/**
 * Generate a unique name with timestamp to avoid data collisions.
 */
export function uniqueName(prefix: string) {
  return `${prefix}-E2E-${Date.now()}`;
}
