import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Deuda", () => {
  test("renders debt instruments page", async ({ page }) => {
    await page.goto("/deuda");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(10);
  });
});
