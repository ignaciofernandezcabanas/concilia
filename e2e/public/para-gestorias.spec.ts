import { test, expect } from "@playwright/test";

test.describe("Para Gestorías", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("loads and renders partner content", async ({ page }) => {
    await page.goto("/para-gestorias");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();
    const text = (await page.locator("body").textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });
});
