import { test, expect } from "../fixtures";

test.describe("Inversiones", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/inversiones");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });
});
