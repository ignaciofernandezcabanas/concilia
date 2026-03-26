import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Reglas de Matching", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/reglas");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(10);
  });
});
