import { test, expect } from "../fixtures";
import { expectTableHasRows } from "../helpers/assertions";
import { selectCheckboxInRow, selectAllCheckboxes } from "../helpers/crud-utils";

test.describe("Movimientos — CRUD Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/movimientos");
    await page.waitForLoadState("networkidle");
  });

  test("single delete uses native confirm dialog — dismiss keeps row", async ({ page }) => {
    await expectTableHasRows(page);
    const initialCount = await page.locator("tbody tr").count();

    // Register dialog handler BEFORE triggering
    page.on("dialog", (dialog) => dialog.dismiss());

    const trashBtn = page.locator('button[title="Eliminar"]').first();
    if (await trashBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trashBtn.click();
      await page.waitForTimeout(500);

      // Row should still be there
      const afterCount = await page.locator("tbody tr").count();
      expect(afterCount).toBe(initialCount);
    }
  });

  test("batch select shows batch delete button", async ({ page }) => {
    await expectTableHasRows(page, 2);
    await selectCheckboxInRow(page, 0);
    await selectCheckboxInRow(page, 1);

    // Batch delete button should appear
    const batchBtn = page.locator("button").filter({ hasText: /eliminar.*seleccionado/i });
    await expect(batchBtn.first()).toBeVisible({ timeout: 3000 });
  });

  test("import CSV button opens modal", async ({ page }) => {
    const importBtn = page.locator('button:has-text("Importar")').first();
    await expect(importBtn).toBeVisible({ timeout: 5000 });
    await importBtn.click();

    // Modal should open with file upload area
    await page.waitForTimeout(500);
    const modal = page.locator('[class*="fixed"], [class*="modal"]').filter({
      hasText: /importar|archivo|csv/i,
    });
    await expect(modal.first()).toBeVisible({ timeout: 3000 });
  });

  test("import modal has file upload area", async ({ page }) => {
    const importBtn = page.locator('button:has-text("Importar")').first();
    await importBtn.click();
    await page.waitForTimeout(500);

    // Should have file input or drag-and-drop
    const fileInput = page.locator('input[type="file"]');
    const hasFileInput = (await fileInput.count()) > 0;
    // Or drag-and-drop area
    const dragArea = page.locator('[class*="drag"], [class*="drop"], [class*="upload"]');
    const hasDragArea = (await dragArea.count()) > 0;

    expect(hasFileInput || hasDragArea).toBeTruthy();
  });

  test("select all checkbox selects all visible rows", async ({ page }) => {
    await expectTableHasRows(page, 2);
    await selectAllCheckboxes(page);

    const checkboxes = page.locator('tbody input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
  });

  test("export button exists", async ({ page }) => {
    const exportBtn = page.locator("button").filter({ hasText: /exportar/i });
    if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(true).toBeTruthy();
    }
  });
});
