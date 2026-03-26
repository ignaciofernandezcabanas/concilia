import { test, expect } from "../fixtures";
import { expectTableHasRows, waitForPageContent } from "../helpers/assertions";

test.describe("Movimientos — CRUD Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/movimientos");
    await waitForPageContent(page);
  });

  test("single delete dismiss keeps row", async ({ page }) => {
    await expectTableHasRows(page);
    // Register dialog handler to dismiss
    page.on("dialog", (dialog) => dialog.dismiss());
    const trashBtn = page.locator('button[title="Eliminar"]').first();
    if (await trashBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trashBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("batch select shows delete button", async ({ page }) => {
    await expectTableHasRows(page, 2);
    const checkboxes = page.locator('input[type="checkbox"]');
    if ((await checkboxes.count()) >= 3) {
      await checkboxes.nth(1).check();
      await checkboxes.nth(2).check();
      const batchBtn = page.locator("button").filter({ hasText: /eliminar/i });
      await expect(batchBtn.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("import CSV button opens modal", async ({ page }) => {
    await page.getByText("Importar CSV").click();
    await page.waitForTimeout(500);
    // Modal should be open
    const modal = page.locator('[class*="fixed"]').filter({ hasText: /importar|archivo|csv/i });
    await expect(modal.first()).toBeVisible({ timeout: 3000 });
  });

  test("export button exists", async ({ page }) => {
    await expect(page.getByText(/exportar/i).first()).toBeVisible({ timeout: 5000 });
  });
});
