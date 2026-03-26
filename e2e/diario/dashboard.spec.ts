import { test, expect } from "../fixtures";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("renders main content without errors", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
    // Should not display NaN or undefined in any visible text
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toContain("NaN");
    expect(bodyText).not.toContain("undefined");
  });

  test("sidebar is visible with Concilia branding", async ({ page }) => {
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.getByText("Concilia")).toBeVisible();
  });

  test("period selector exists and navigates", async ({ page }) => {
    // Look for chevron/arrow buttons used for period navigation
    const prevButton = page.locator("button:has(svg)").first();

    if (await prevButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prevButton.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });
});
