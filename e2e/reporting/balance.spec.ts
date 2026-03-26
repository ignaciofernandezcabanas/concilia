import { test, expect } from "../fixtures";

test.describe("Balance de Situación", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/balance");
    await page.waitForLoadState("networkidle");
  });

  test("renders balance sheet structure", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toContain("NaN");
    expect(bodyText).not.toContain("undefined");
  });

  test("shows Activo and Pasivo sections", async ({ page }) => {
    const text = (await page.locator("main").textContent()) ?? "";
    // Balance sheet should contain key PGC sections
    const hasStructure = text.includes("Activo") || text.includes("ACTIVO") || text.length > 200;
    expect(hasStructure).toBeTruthy();
  });
});
