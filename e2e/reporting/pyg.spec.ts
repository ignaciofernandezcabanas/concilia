import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("PyG (Pérdidas y Ganancias)", () => {
  test("renders P&L report", async ({ page }) => {
    await page.goto("/pyg");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text).not.toContain("NaN");
    expect(text?.length).toBeGreaterThan(50);
  });

  test("period selector exists", async ({ page }) => {
    await page.goto("/pyg");
    await waitForPageContent(page);
    const buttons = page.locator("main button:has(svg)");
    expect(await buttons.count()).toBeGreaterThan(0);
  });
});
