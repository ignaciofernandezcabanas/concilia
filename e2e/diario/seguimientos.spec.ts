import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Seguimientos", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/seguimientos");
    await waitForPageContent(page);
  });

  test("page has content or empty state", async ({ page }) => {
    await page.goto("/seguimientos");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(5);
  });
});
