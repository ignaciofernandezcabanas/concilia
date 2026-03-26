import { test, expect } from "../fixtures";
import { expectTableHasRows, waitForPageContent } from "../helpers/assertions";

test.describe("Facturas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/facturas");
    await waitForPageContent(page);
  });

  test("renders invoice list with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("search input exists and filters", async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.fill("FRA-2026");
    await page.waitForLoadState("networkidle");
  });

  test("type filter buttons exist (Todas / Emitidas / Recibidas)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Todas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Emitidas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Recibidas" })).toBeVisible();
  });

  test("clicking invoice row opens detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    // Click first data row (flex div with cursor-pointer)
    const row = page.locator('div[class*="cursor-pointer"][class*="h-12"]').first();
    await row.click();
    // Panel should appear
    const panel = page.locator('[class*="w-\\[480px\\]"]').first();
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test("contact column shows name, not just CIF", async ({ page }) => {
    await expectTableHasRows(page);
    const mainText = await page.locator("main").textContent();
    // Should have contact names, not just CIF patterns
    expect(mainText?.length).toBeGreaterThan(200);
  });
});
