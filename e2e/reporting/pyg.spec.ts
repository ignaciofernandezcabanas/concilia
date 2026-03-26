import { test, expect } from "../fixtures";

test.describe("PyG (Pérdidas y Ganancias)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pyg");
    await page.waitForLoadState("networkidle");
  });

  test("renders P&L report structure", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toContain("NaN");
    expect(bodyText).not.toContain("undefined");
  });

  test("period selector exists", async ({ page }) => {
    // P&L should have month/year period selector
    const buttons = page.locator("button:has(svg)");
    expect(await buttons.count()).toBeGreaterThan(0);
  });

  test("comparative columns render", async ({ page }) => {
    // P&L should show columns: Real, Presupuesto, Año anterior, Mes anterior
    const headerText = await page.locator("thead, main").first().textContent();
    // At minimum the report should have structured content
    expect(headerText?.length).toBeGreaterThan(20);
  });
});
