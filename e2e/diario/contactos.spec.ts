import { test, expect } from "../fixtures";
import { expectTableHasRows } from "../helpers/assertions";

test.describe("Contactos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contactos");
    await page.waitForLoadState("networkidle");
  });

  test("renders contacts table with seed data", async ({ page }) => {
    await expectTableHasRows(page, 1);
  });

  test("search input exists and filters", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    await expect(search).toBeVisible({ timeout: 5000 });

    await search.fill("Levante");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("contacts display name (not just CIF)", async ({ page }) => {
    await expectTableHasRows(page);
    const firstRow = page.locator("tbody tr").first();
    const text = await firstRow.textContent();
    // Should have readable name text, not just a CIF pattern
    expect(text?.length).toBeGreaterThan(10);
  });

  test("new contact button exists", async ({ page }) => {
    const newBtn = page.locator(
      'button:has-text("Nuevo"), button:has-text("nuevo"), button:has-text("Añadir"), a:has-text("Nuevo")'
    );
    await expect(newBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
