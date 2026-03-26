import { test, expect } from "../fixtures";
import { expectTableHasRows, getDataRows, waitForPageContent } from "../helpers/assertions";

test.describe("Conciliación", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/conciliacion");
    await waitForPageContent(page);
  });

  test("renders transaction list with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("header has expected columns (Fecha, Concepto, Importe)", async ({ page }) => {
    // Header is a flex div with spans, not <thead>
    const headerText = await page.locator("main").first().textContent();
    expect(headerText?.toLowerCase()).toContain("fecha");
    expect(headerText?.toLowerCase()).toContain("concepto");
    expect(headerText?.toLowerCase()).toContain("importe");
  });

  test("status filter buttons are visible", async ({ page }) => {
    const todosBtn = page.getByRole("button", { name: "Todos" }).first();
    await expect(todosBtn).toBeVisible({ timeout: 5000 });
  });

  test("clicking a row opens reconciliation panel", async ({ page }) => {
    await expectTableHasRows(page);
    const rows = getDataRows(page);
    await rows.first().click();

    // Panel should appear
    const panel = page.locator('[class*="w-\\[400px\\]"]').first();
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test("amounts display with comma as decimal separator", async ({ page }) => {
    await expectTableHasRows(page);
    // Look for formatted amounts anywhere in the data rows
    const text = await page.locator("main").textContent();
    // Spanish format uses comma for decimals
    expect(text).toMatch(/\d+,\d{2}/);
  });
});
