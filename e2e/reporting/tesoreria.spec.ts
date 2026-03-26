import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Tesorería", () => {
  test("renders treasury forecast", async ({ page }) => {
    await page.goto("/tesoreria");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(20);
  });
});
