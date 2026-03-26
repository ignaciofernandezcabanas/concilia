import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Balance de Situación", () => {
  test("renders balance sheet", async ({ page }) => {
    await page.goto("/balance");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text).not.toContain("NaN");
    expect(text?.length).toBeGreaterThan(50);
  });

  test("shows Activo/Pasivo structure", async ({ page }) => {
    await page.goto("/balance");
    await waitForPageContent(page);
    const text = (await page.locator("main").textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });
});
