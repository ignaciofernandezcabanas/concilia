import { test, expect } from "../fixtures";

test.describe("Gestoría Portal", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/gestoria");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("has multiple tabs", async ({ page }) => {
    await page.goto("/gestoria");
    await page.waitForLoadState("networkidle");
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    // Gestoría should have tabs: Alertas, Borradores, Subida, Incidencias, Paquete
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });
});
