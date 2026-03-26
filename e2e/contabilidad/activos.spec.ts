import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Activos Fijos", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/activos");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(5);
  });
});
