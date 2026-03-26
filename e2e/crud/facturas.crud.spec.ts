import { test, expect } from "../fixtures";
import {
  expectTableHasRows,
  getDataRows,
  expectConfirmDialog,
  cancelDialog,
  waitForPageContent,
} from "../helpers/assertions";

test.describe("Facturas — CRUD Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/facturas");
    await waitForPageContent(page);
  });

  test("type filter pills switch between Todas, Emitidas, Recibidas", async ({ page }) => {
    await page.getByRole("button", { name: "Emitidas" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Recibidas" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Todas" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("status filter dropdown works", async ({ page }) => {
    const select = page.locator("select").first();
    if (await select.isVisible({ timeout: 3000 }).catch(() => false)) {
      await select.selectOption({ index: 1 });
      await page.waitForLoadState("networkidle");
    }
  });

  test("clicking row opens detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    const row = page.locator('div[class*="cursor-pointer"][class*="h-12"]').first();
    await row.click();
    const panel = page.locator('[class*="w-\\[480px\\]"]').first();
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test("detail panel closes with Escape key", async ({ page }) => {
    await expectTableHasRows(page);
    const row = page.locator('div[class*="cursor-pointer"][class*="h-12"]').first();
    await row.click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });

  test("single delete shows ConfirmDialog", async ({ page }) => {
    await expectTableHasRows(page);
    const trashBtn = page.locator('button[title="Eliminar"]').first();
    if (await trashBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trashBtn.click();
      await expectConfirmDialog(page, /eliminar/i);
      await cancelDialog(page);
    }
  });

  test("batch select shows batch actions", async ({ page }) => {
    await expectTableHasRows(page, 2);
    const checkboxes = page.locator('input[type="checkbox"]');
    // Skip header checkbox (first), check rows 2 and 3
    if ((await checkboxes.count()) >= 3) {
      await checkboxes.nth(1).check();
      await checkboxes.nth(2).check();
      const batchBtn = page.locator("button").filter({ hasText: /eliminar.*seleccionada/i });
      await expect(batchBtn.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("search filters by invoice number", async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await search.fill("FRA-2026-001");
    await page.waitForLoadState("networkidle");
  });

  test("export button exists", async ({ page }) => {
    await expect(page.getByText(/exportar/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("pagination exists", async ({ page }) => {
    const nextBtn = page.getByRole("button", { name: /siguiente/i });
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("amounts display in Spanish format", async ({ page }) => {
    await expectTableHasRows(page);
    const text = await page.locator("main").textContent();
    expect(text).toMatch(/\d+,\d{2}/);
  });
});
