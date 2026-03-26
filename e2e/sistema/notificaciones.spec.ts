import { test, expect } from "../fixtures";

test.describe("Notificaciones", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/notificaciones");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });
});
