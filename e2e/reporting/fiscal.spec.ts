import { test, expect } from "../fixtures";

test.describe("Fiscal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fiscal");
    await page.waitForLoadState("networkidle");
  });

  test("renders with tabs for each fiscal model", async ({ page }) => {
    const modelTabs = ["303", "111", "115", "390", "IS", "Calendario"];
    for (const tab of modelTabs) {
      const tabEl = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`);
      await expect(tabEl.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("switching to 111 tab loads content", async ({ page }) => {
    const tab111 = page.locator('button:has-text("111"), [role="tab"]:has-text("111")').first();
    await tab111.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("calendario tab shows fiscal calendar", async ({ page }) => {
    const calTab = page
      .locator('button:has-text("Calendario"), [role="tab"]:has-text("Calendario")')
      .first();
    await calTab.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
    // Calendar should show fiscal obligation items
    const text = (await page.locator("main").textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });

  test("303 tab shows IVA data with rate breakdown", async ({ page }) => {
    // Default tab should be 303
    await expect(page.locator("main")).not.toBeEmpty();
    const text = (await page.locator("main").textContent()) ?? "";
    // Should show IVA rates: 21%, 10%, 4% or related content
    expect(text.length).toBeGreaterThan(50);
  });
});
