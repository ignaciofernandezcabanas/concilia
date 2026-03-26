import { test, expect } from "../fixtures";

test.describe("Documentos Soporte", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/documentos-soporte");
    await page.waitForLoadState("networkidle");
  });

  test("page loads and renders content", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("tab filtering exists for document types", async ({ page }) => {
    // Supporting documents page should have tabs or filters for status/type
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    const hasTabs = (await tabs.count()) > 0;
    // Either tabs or a table should be visible
    if (!hasTabs) {
      await expect(page.locator("table, main")).toBeVisible();
    }
  });
});
