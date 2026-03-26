import { test, expect } from "../fixtures";

test.describe("Periodificaciones", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/periodificaciones");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });
});
