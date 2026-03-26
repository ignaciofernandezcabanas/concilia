import { test, expect } from "../fixtures";
import { expectTableHasRows, waitForPageContent } from "../helpers/assertions";

test.describe("Movimientos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/movimientos");
    await waitForPageContent(page);
  });

  test("renders bank transaction list with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("search input exists", async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await expect(search).toBeVisible({ timeout: 5000 });
  });

  test("dates display in Spanish format", async ({ page }) => {
    await expectTableHasRows(page);
    const text = await page.locator("main").textContent();
    // Should contain formatted dates
    expect(text).toMatch(/\d{1,2}\s\w{3}\s\d{4}|\d{2}\/\d{2}\/\d{4}/);
  });

  test("amounts display with Spanish formatting", async ({ page }) => {
    await expectTableHasRows(page);
    const text = await page.locator("main").textContent();
    expect(text).toMatch(/\d+,\d{2}/);
  });

  test("import button exists", async ({ page }) => {
    await expect(page.getByText("Importar CSV")).toBeVisible({ timeout: 5000 });
  });
});
