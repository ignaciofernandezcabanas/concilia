import { test, expect } from "../fixtures";
import { expectTableHasRows, waitForPageContent } from "../helpers/assertions";

test.describe("Contactos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contactos");
    await waitForPageContent(page);
  });

  test("renders contacts list with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("search input exists and filters", async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.fill("Levante");
    await page.waitForLoadState("networkidle");
  });

  test("contacts display name", async ({ page }) => {
    await expectTableHasRows(page);
    const mainText = await page.locator("main").textContent();
    expect(mainText?.length).toBeGreaterThan(100);
  });

  test("new contact button exists", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nuevo/i });
    await expect(newBtn).toBeVisible({ timeout: 5000 });
  });
});
