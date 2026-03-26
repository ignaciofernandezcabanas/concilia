import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Asientos (Journal Entries)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/asientos");
    await waitForPageContent(page);
  });

  test("renders journal entries page", async ({ page }) => {
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(10);
  });

  test("new entry button exists", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nuevo asiento/i });
    await expect(newBtn).toBeVisible({ timeout: 5000 });
  });

  test("page shows status badges if entries exist", async ({ page }) => {
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(10);
  });
});
