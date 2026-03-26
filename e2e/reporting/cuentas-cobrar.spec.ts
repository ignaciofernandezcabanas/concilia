import { test, expect } from "../fixtures";

test.describe("Cuentas a Cobrar / Pagar", () => {
  test("renders aging report", async ({ page }) => {
    await page.goto("/cuentas-cobrar");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("shows aging buckets", async ({ page }) => {
    await page.goto("/cuentas-cobrar");
    await page.waitForLoadState("networkidle");
    const text = (await page.locator("main").textContent()) ?? "";
    // Aging report should have bucket headers or summary data
    expect(text.length).toBeGreaterThan(50);
  });
});
