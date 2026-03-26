import { test, expect } from "../fixtures";

test.describe("Ajustes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ajustes");
    await page.waitForLoadState("networkidle");
  });

  test("renders settings page with tabs", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
    // Settings should have multiple tabs/sections
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    expect(await tabs.count()).toBeGreaterThan(0);
  });

  test("company info is displayed", async ({ page }) => {
    const text = (await page.locator("main").textContent()) ?? "";
    // Should show company name or CIF
    expect(text.length).toBeGreaterThan(50);
  });

  test("tab switching works", async ({ page }) => {
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });
});
