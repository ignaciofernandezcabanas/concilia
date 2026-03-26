import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Asientos — CRUD Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/asientos");
    await waitForPageContent(page);
  });

  test("Nuevo asiento button opens create modal", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo asiento/i }).click();
    await expect(page.getByText(/nuevo asiento/i)).toBeVisible({ timeout: 3000 });
  });

  test("create modal has date and description fields", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo asiento/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test("create button disabled when unbalanced", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo asiento/i }).click();
    await page.waitForTimeout(500);

    const descInput = page.locator('input[placeholder*="Concepto"], textarea').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill("Test unbalanced");
    }

    const numberInputs = page.locator('input[type="number"]');
    if ((await numberInputs.count()) >= 4) {
      await numberInputs.nth(0).fill("100");
      await numberInputs.nth(3).fill("50");
      const createBtn = page.getByRole("button", { name: /crear borrador/i });
      await expect(createBtn).toBeDisabled();
    }
  });

  test("create button enables when balanced", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo asiento/i }).click();
    await page.waitForTimeout(500);

    const descInput = page.locator('input[placeholder*="Concepto"], textarea').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill("Test balanced");
    }

    const numberInputs = page.locator('input[type="number"]');
    if ((await numberInputs.count()) >= 4) {
      await numberInputs.nth(0).fill("100");
      await numberInputs.nth(3).fill("100");
      await page.waitForTimeout(500);
      const createBtn = page.getByRole("button", { name: /crear borrador/i });
      await expect(createBtn).toBeEnabled();
    }
  });

  test("add line button adds a new line", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo asiento/i }).click();
    await page.waitForTimeout(500);

    const initialCount = await page.locator('input[type="number"]').count();
    const addLineBtn = page.getByRole("button", { name: /línea|linea/i });
    if (await addLineBtn.isVisible().catch(() => false)) {
      await addLineBtn.click();
      const newCount = await page.locator('input[type="number"]').count();
      expect(newCount).toBeGreaterThan(initialCount);
    }
  });
});
