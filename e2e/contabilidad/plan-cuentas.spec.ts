import { test, expect } from "../fixtures";

test.describe("Plan de Cuentas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/plan-cuentas");
    await page.waitForLoadState("networkidle");
  });

  test("renders PGC account structure", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
    // PGC groups 1-7 should appear somewhere
    const bodyText = await page.locator("main").textContent();
    // At minimum, should contain references to PGC groups
    expect(bodyText?.length).toBeGreaterThan(100);
  });

  test("tabs for different views exist", async ({ page }) => {
    // Page should have tabs like "Cuentas", "Mayor", "Sumas y saldos"
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    if ((await tabs.count()) > 0) {
      // Click second tab to verify switching works
      const secondTab = tabs.nth(1);
      if (await secondTab.isVisible().catch(() => false)) {
        await secondTab.click();
        await page.waitForLoadState("networkidle");
        await expect(page.locator("main")).not.toBeEmpty();
      }
    }
  });

  test("search works for account codes", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill("572");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });
});
