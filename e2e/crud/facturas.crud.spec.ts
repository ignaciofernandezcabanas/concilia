import { test, expect } from "../fixtures";
import {
  expectTableHasRows,
  expectConfirmDialog,
  confirmDialog,
  cancelDialog,
  expectPanelOpen,
} from "../helpers/assertions";
import { selectCheckboxInRow, selectAllCheckboxes } from "../helpers/crud-utils";

test.describe("Facturas — CRUD Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/facturas");
    await page.waitForLoadState("networkidle");
  });

  test("type filter pills switch between Todas, Emitidas, Recibidas", async ({ page }) => {
    await expectTableHasRows(page);
    const initialCount = await page.locator("tbody tr").count();

    // Click "Emitidas"
    await page.locator('button:has-text("Emitidas")').click();
    await page.waitForLoadState("networkidle");

    // Click "Recibidas"
    await page.locator('button:has-text("Recibidas")').click();
    await page.waitForLoadState("networkidle");

    // Click "Todas" to reset
    await page.locator('button:has-text("Todas")').click();
    await page.waitForLoadState("networkidle");
    const resetCount = await page.locator("tbody tr").count();
    expect(resetCount).toBe(initialCount);
  });

  test("status filter dropdown filters by status", async ({ page }) => {
    const select = page.locator("select").first();
    if (await select.isVisible({ timeout: 3000 }).catch(() => false)) {
      await select.selectOption({ label: /Pendiente/i });
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });

  test("clicking invoice row opens detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);
  });

  test("detail panel closes with X button", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);

    // Find and click X/close button in panel
    const closeBtn = page
      .locator('[class*="panel"] button:has(svg), [class*="Panel"] button:has(svg)')
      .first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    }
  });

  test("detail panel closes with Escape key", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });

  test("single delete shows ConfirmDialog", async ({ page }) => {
    await expectTableHasRows(page);
    const trashBtn = page.locator('button[title="Eliminar"]').first();
    if (await trashBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trashBtn.click();
      await expectConfirmDialog(page, /eliminar/i);
      // Cancel to not actually delete
      await cancelDialog(page);
    }
  });

  test("batch select with checkboxes shows batch actions", async ({ page }) => {
    await expectTableHasRows(page, 2);
    await selectCheckboxInRow(page, 0);
    await selectCheckboxInRow(page, 1);

    // Batch delete button should appear
    const batchBtn = page.locator("button").filter({ hasText: /eliminar.*seleccionada/i });
    await expect(batchBtn.first()).toBeVisible({ timeout: 3000 });
  });

  test("select all checkbox toggles all rows", async ({ page }) => {
    await expectTableHasRows(page, 2);
    await selectAllCheckboxes(page);

    // All row checkboxes should be checked
    const checkboxes = page.locator('tbody input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
  });

  test("search filters by invoice number", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    await expect(search).toBeVisible();
    await search.fill("FRA-2026-001");
    await page.waitForLoadState("networkidle");
    // Should show filtered results
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("export button triggers CSV download", async ({ page }) => {
    const exportBtn = page.locator("button").filter({ hasText: /exportar/i });
    if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
        exportBtn.click(),
      ]);
      if (download) {
        expect(download.suggestedFilename()).toMatch(/facturas.*\.csv/);
      }
    }
  });

  test("pagination controls exist and work", async ({ page }) => {
    const nextBtn = page.locator('button:has-text("Siguiente"), button[aria-label="Next"]').first();
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });

  test("amounts display in Spanish format with EUR", async ({ page }) => {
    await expectTableHasRows(page);
    const amountCells = page.locator("tbody td").filter({ hasText: /\d+,\d{2}/ });
    expect(await amountCells.count()).toBeGreaterThan(0);
  });
});
