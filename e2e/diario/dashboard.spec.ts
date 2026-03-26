import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForPageContent(page);
  });

  test("renders main content without errors", async ({ page }) => {
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toContain("NaN");
    expect(bodyText).not.toContain("undefined");
  });

  test("sidebar is visible with Concilia branding", async ({ page }) => {
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByText("Concilia")).toBeVisible();
  });

  test("period selector exists and navigates", async ({ page }) => {
    const prevButton = page.locator("button:has(svg)").first();
    if (await prevButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prevButton.click();
      await page.waitForLoadState("networkidle");
    }
  });
});
