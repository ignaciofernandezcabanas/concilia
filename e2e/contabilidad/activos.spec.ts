import { test, expect } from "../fixtures";

test.describe("Activos Fijos", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/activos");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });
});
