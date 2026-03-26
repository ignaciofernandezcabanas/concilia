import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Fiscal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fiscal");
    await waitForPageContent(page);
  });

  test("renders with tabs for each fiscal model", async ({ page }) => {
    for (const tab of ["303", "111", "115", "390", "IS", "Calendario"]) {
      await expect(page.getByRole("button", { name: tab }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("switching to 111 tab loads content", async ({ page }) => {
    await page.getByRole("button", { name: "111" }).first().click();
    await page.waitForLoadState("networkidle");
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(50);
  });

  test("calendario tab shows fiscal calendar", async ({ page }) => {
    await page.getByRole("button", { name: "Calendario" }).first().click();
    await page.waitForLoadState("networkidle");
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(100);
  });
});
