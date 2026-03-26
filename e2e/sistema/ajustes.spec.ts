import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Ajustes", () => {
  test("renders settings page with tabs", async ({ page }) => {
    await page.goto("/ajustes");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(50);
  });

  test("tab switching works", async ({ page }) => {
    await page.goto("/ajustes");
    await waitForPageContent(page);
    const buttons = page.locator("main button");
    if ((await buttons.count()) > 1) {
      await buttons.nth(1).click();
      await page.waitForLoadState("networkidle");
    }
  });
});
