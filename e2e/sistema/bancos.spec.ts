import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Cuentas Bancarias", () => {
  test("renders bank accounts page", async ({ page }) => {
    await page.goto("/ajustes/bancos");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(50);
  });

  test("new account button exists", async ({ page }) => {
    await page.goto("/ajustes/bancos");
    await waitForPageContent(page);
    const newBtn = page.getByRole("button", { name: /nueva|añadir/i });
    await expect(newBtn).toBeVisible({ timeout: 5000 });
  });
});
