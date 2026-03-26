import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Documentos Soporte", () => {
  test("page loads and renders content", async ({ page }) => {
    await page.goto("/documentos-soporte");
    await waitForPageContent(page);
  });

  test("has filtering or content", async ({ page }) => {
    await page.goto("/documentos-soporte");
    await waitForPageContent(page);
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(10);
  });
});
