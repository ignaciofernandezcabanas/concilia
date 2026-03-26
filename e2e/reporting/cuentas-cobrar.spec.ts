import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Cuentas a Cobrar / Pagar", () => {
  test("renders aging report", async ({ page }) => {
    await page.goto("/cuentas-cobrar");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(20);
  });
});
