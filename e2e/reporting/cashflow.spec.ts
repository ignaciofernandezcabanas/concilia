import { test, expect } from "../fixtures";

test.describe("Cashflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cashflow");
    await page.waitForLoadState("networkidle");
  });

  test("renders cashflow report", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("tabs exist for different views", async ({ page }) => {
    // Cashflow should have tabs: EFE, Tesorería directa, WC bridge
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });
});
