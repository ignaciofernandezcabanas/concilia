import { Page, expect } from "@playwright/test";

/**
 * Verify a page loads without 500 errors or uncaught JS exceptions.
 */
export async function expectPageLoads(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response?.status(), `${path} returned ${response?.status()}`).toBeLessThan(500);

  // Give client-side JS a moment to throw
  await page.waitForTimeout(500);
  expect(errors, `JS errors on ${path}: ${errors.join(", ")}`).toHaveLength(0);
}

/**
 * Verify a table has at least `minRows` visible rows.
 */
export async function expectTableHasRows(page: Page, minRows = 1) {
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 10000 });
  const count = await rows.count();
  expect(count, `Expected >= ${minRows} rows, got ${count}`).toBeGreaterThanOrEqual(minRows);
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
 * Assert a side panel is visible (detail, reconciliation, etc.).
 */
export async function expectPanelOpen(page: Page) {
  const panel = page
    .locator(
      '[class*="panel"], [class*="Panel"], aside, [class*="w-\\[400px\\]"], [class*="w-\\[480px\\]"]'
    )
    .first();
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
