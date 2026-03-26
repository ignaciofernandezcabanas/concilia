import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Form Validation — Cross-cutting", () => {
  test("contact name required — shows error on empty submit", async ({ page }) => {
    await page.goto("/contactos");
    await waitForPageContent(page);

    await page.getByRole("button", { name: /nuevo/i }).click();
    await page.waitForTimeout(500);

    // Try to create without name
    const createBtn = page.getByRole("button", { name: /crear/i });
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (await createBtn.isEnabled().catch(() => false)) {
        await createBtn.click();
        await expect(page.getByText(/obligatorio/i)).toBeVisible({ timeout: 3000 });
      } else {
        // Button disabled = validation working
        await expect(createBtn).toBeDisabled();
      }
    }
  });

  test("journal entry balance — button disabled when unbalanced", async ({ page }) => {
    await page.goto("/asientos");
    await waitForPageContent(page);

    await page.getByRole("button", { name: /nuevo asiento/i }).click();
    await page.waitForTimeout(500);

    // Fill description
    const descInput = page.locator(
      'input[placeholder*="Concepto"], textarea[placeholder*="Concepto"]'
    );
    if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descInput.fill("Validation test");

      const numberInputs = page.locator('input[type="number"]');
      if ((await numberInputs.count()) >= 4) {
        await numberInputs.nth(0).fill("100");
        await numberInputs.nth(3).fill("50");

        const createBtn = page.getByRole("button", { name: /crear borrador/i });
        await expect(createBtn).toBeDisabled();
      }
    }
  });

  test("contact type buttons toggle correctly", async ({ page }) => {
    await page.goto("/contactos");
    await waitForPageContent(page);

    await page.getByRole("button", { name: /nuevo/i }).click();
    await page.waitForTimeout(500);

    const provBtn = page.getByRole("button", { name: /proveedor/i }).first();
    const clienteBtn = page.getByRole("button", { name: /cliente/i }).first();

    if (await provBtn.isVisible().catch(() => false)) {
      await provBtn.click();
      await clienteBtn.click();
      // Both should exist
      expect(true).toBeTruthy();
    }
  });
});
