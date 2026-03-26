import { test, expect } from "../fixtures";
import { expectTableHasRows } from "../helpers/assertions";

test.describe("Movimientos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/movimientos");
    await page.waitForLoadState("networkidle");
  });

  test("renders bank transaction table with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("search input exists", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    await expect(search).toBeVisible({ timeout: 5000 });
  });

  test("table displays dates in dd/mm/yyyy format", async ({ page }) => {
    await expectTableHasRows(page);
    // Look for dates in Spanish format: dd/mm/yyyy
    const dateCells = page.locator("tbody td").filter({ hasText: /\d{2}\/\d{2}\/\d{4}/ });
    expect(await dateCells.count()).toBeGreaterThan(0);
  });

  test("amounts display with Spanish formatting", async ({ page }) => {
    await expectTableHasRows(page);
    const amountCells = page.locator("tbody td").filter({ hasText: /\d+,\d{2}/ });
    expect(await amountCells.count()).toBeGreaterThan(0);
  });

  test("import button exists", async ({ page }) => {
    const importBtn = page.locator('button:has-text("Importar"), button:has-text("importar")');
    await expect(importBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
