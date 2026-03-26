import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Cashflow", () => {
  test("renders cashflow report", async ({ page }) => {
    await page.goto("/cashflow");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(20);
  });
});
