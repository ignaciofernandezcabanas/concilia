import { test, expect } from "../fixtures";
import { expectTableHasRows } from "../helpers/assertions";

test.describe("Conciliación", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/conciliacion");
    await page.waitForLoadState("networkidle");
  });

  test("renders transaction table with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("table has expected columns (Fecha, Concepto, Importe)", async ({ page }) => {
    const headers = page.locator("thead th");
    const headerTexts = await headers.allTextContents();
    const joined = headerTexts.join(" ").toLowerCase();
    expect(joined).toContain("fecha");
    expect(joined).toContain("concepto");
    expect(joined).toContain("importe");
  });

  test("status filter dropdown is visible", async ({ page }) => {
    const filter = page.locator("select, [role='combobox']").first();
    await expect(filter).toBeVisible({ timeout: 5000 });
  });

  test("clicking a row opens reconciliation panel", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();

    // Panel should appear — look for a side panel or detail section
    const panel = page
      .locator('[class*="panel"], [class*="Panel"], aside, [class*="detail"]')
      .first();
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test("amounts display in Spanish number format", async ({ page }) => {
    await expectTableHasRows(page);
    // Check that at least one amount cell contains comma as decimal separator
    const amountCells = page.locator("tbody td").filter({ hasText: /\d+,\d{2}/ });
    expect(await amountCells.count()).toBeGreaterThan(0);
  });
});
