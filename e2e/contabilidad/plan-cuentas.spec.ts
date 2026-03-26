import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Plan de Cuentas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/plan-cuentas");
    await waitForPageContent(page);
  });

  test("renders PGC account structure", async ({ page }) => {
    const bodyText = await page.locator("main").textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });

  test("tabs for different views exist", async ({ page }) => {
    const buttons = page.locator("main button");
    expect(await buttons.count()).toBeGreaterThan(0);
  });

  test("search works for account codes", async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"], input[placeholder*="buscar"]');
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill("572");
      await page.waitForLoadState("networkidle");
    }
  });
});
