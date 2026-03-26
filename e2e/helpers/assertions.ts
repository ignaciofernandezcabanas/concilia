import { Page, expect } from "@playwright/test";

/**
 * Verify a page loads without 500 errors or uncaught JS exceptions.
 */
export async function expectPageLoads(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status(), `${path} returned ${response?.status()}`).toBeLessThan(500);

  await page.waitForTimeout(500);
  expect(errors, `JS errors on ${path}: ${errors.join(", ")}`).toHaveLength(0);
}

/**
 * Verify a data list has at least `minRows` visible rows.
 * Works with both <table> and flex-div layouts.
 */
export async function expectTableHasRows(page: Page, minRows = 1) {
  // Try actual table rows first, then flex-div rows
  const tableRows = page.locator("tbody tr");
  const flexRows = page.locator(
    'div.border-b.cursor-pointer, div[class*="border-b"][class*="h-12"], div[class*="border-b"][class*="h-11"]'
  );

  const tableCount = await tableRows.count();
  if (tableCount > 0) {
    expect(tableCount).toBeGreaterThanOrEqual(minRows);
    return;
  }

  // Wait for flex rows to appear
  await expect(flexRows.first()).toBeVisible({ timeout: 10000 });
  const flexCount = await flexRows.count();
  expect(flexCount, `Expected >= ${minRows} rows, got ${flexCount}`).toBeGreaterThanOrEqual(
    minRows
  );
}

/**
 * Get data rows (works with both table and flex-div layouts).
 */
export function getDataRows(page: Page) {
  return page.locator(
    'div[class*="flex"][class*="items-center"][class*="h-12"][class*="border-b"], div[class*="flex"][class*="items-center"][class*="h-11"][class*="border-b"]'
  );
}

/**
 * Wait for a Toast notification with matching text.
 */
export async function expectToast(page: Page, message: string | RegExp) {
  const toast = page
    .locator('[class*="toast"], [class*="Toast"], [role="alert"]')
    .filter({ hasText: message });
  await expect(toast.first()).toBeVisible({ timeout: 5000 });
}

/**
 * Assert a ConfirmDialog is visible with the given title text.
 */
export async function expectConfirmDialog(page: Page, title: string | RegExp) {
  const dialog = page.locator('[class*="fixed"]').filter({ hasText: title });
  await expect(dialog.first()).toBeVisible({ timeout: 3000 });
}

/**
 * Click the confirm button inside a ConfirmDialog.
 */
export async function confirmDialog(page: Page, confirmLabel: string | RegExp) {
  await page.getByRole("button", { name: confirmLabel }).click();
}

/**
 * Click the cancel button inside a ConfirmDialog.
 */
export async function cancelDialog(page: Page) {
  await page.getByRole("button", { name: /cancelar/i }).click();
}

/**
 * Assert a side panel is visible.
 */
export async function expectPanelOpen(page: Page) {
  const panel = page.locator('[class*="w-\\[400px\\]"], [class*="w-\\[480px\\]"], aside').first();
  await expect(panel).toBeVisible({ timeout: 5000 });
}

/**
 * Assert a button is disabled.
 */
export async function expectButtonDisabled(page: Page, text: string | RegExp) {
  const btn = page.getByRole("button", { name: text });
  await expect(btn).toBeDisabled();
}

/**
 * Assert a button is enabled.
 */
export async function expectButtonEnabled(page: Page, text: string | RegExp) {
  const btn = page.getByRole("button", { name: text });
  await expect(btn).toBeEnabled();
}

/**
 * Wait for page content to load (networkidle + main has content).
 */
export async function waitForPageContent(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
}
