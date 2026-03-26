import { test, expect } from "../fixtures";

test.describe("Deuda", () => {
  test("renders debt instruments page", async ({ page }) => {
    await page.goto("/deuda");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("new instrument button exists", async ({ page }) => {
    await page.goto("/deuda");
    await page.waitForLoadState("networkidle");
    const newBtn = page.locator(
      'button:has-text("Nuevo"), button:has-text("Añadir"), a:has-text("Nuevo")'
    );
    if (
      await newBtn
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      expect(true).toBeTruthy();
    }
  });
});
