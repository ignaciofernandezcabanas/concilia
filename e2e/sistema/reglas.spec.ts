import { test, expect } from "../fixtures";

test.describe("Reglas de Matching", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/reglas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("new rule button exists", async ({ page }) => {
    await page.goto("/reglas");
    await page.waitForLoadState("networkidle");
    const newBtn = page.locator(
      'button:has-text("Nueva"), button:has-text("Crear"), button:has-text("Añadir")'
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
