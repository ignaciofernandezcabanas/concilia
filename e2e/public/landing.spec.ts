import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("loads and renders marketing content", async ({ page }) => {
    await page.goto("/landing");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();
    // Should have some marketing content about Concilia
    const text = (await page.locator("body").textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });
});
