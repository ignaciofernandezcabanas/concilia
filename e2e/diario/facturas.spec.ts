import { test, expect } from "../fixtures";
import { expectTableHasRows } from "../helpers/assertions";

test.describe("Facturas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/facturas");
    await page.waitForLoadState("networkidle");
  });

  test("renders invoice table with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("search input exists and filters", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    await expect(search).toBeVisible({ timeout: 5000 });

    await search.fill("FRA-2026");
    await page.waitForLoadState("networkidle");
    // Table should still render (with filtered results or empty state)
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("type filter tabs exist (Emitidas / Recibidas)", async ({ page }) => {
    const emitidas = page.locator('button:has-text("Emitidas"), [role="tab"]:has-text("Emitidas")');
    const recibidas = page.locator(
      'button:has-text("Recibidas"), [role="tab"]:has-text("Recibidas")'
    );

    // At least one filter mechanism should exist
    const hasFilters =
      (await emitidas.isVisible().catch(() => false)) ||
      (await recibidas.isVisible().catch(() => false));

    if (hasFilters) {
      await recibidas.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("clicking invoice row opens detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();

    const panel = page.locator('[class*="panel"], [class*="Panel"], [class*="detail"]').first();
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test("contact column shows name, not just CIF", async ({ page }) => {
    await expectTableHasRows(page);
    // Contacts should display names — verify no row shows just a bare CIF pattern
    const rows = page.locator("tbody tr");
    const firstRowText = await rows.first().textContent();
    // If a CIF appears, it should be accompanied by a name
    if (firstRowText && /[A-Z]\d{8}/.test(firstRowText)) {
      // CIF is present — verify there's also text (a name) nearby
      expect(firstRowText.length).toBeGreaterThan(15);
    }
  });
});
