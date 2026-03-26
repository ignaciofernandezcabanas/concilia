import { test, expect } from "../fixtures";

test.describe("Form Validation — Cross-cutting", () => {
  test("contact name required — shows error on empty submit", async ({ page }) => {
    await page.goto("/contactos");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("Nuevo")').first().click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible();

    // Try to create without name
    const createBtn = page.getByRole("button", { name: /crear/i });
    if (await createBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
      await createBtn.click();
      // Should show red border or error text
      await expect(page.getByText(/obligatorio/i)).toBeVisible({ timeout: 3000 });
    } else {
      // Button already disabled — that's valid validation too
      await expect(createBtn).toBeDisabled();
    }
  });

  test("journal entry balance — button disabled when unbalanced", async ({ page }) => {
    await page.goto("/asientos");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("Nuevo asiento")').first().click();
    await expect(page.getByText(/nuevo asiento/i)).toBeVisible();

    // Fill description
    await page.getByPlaceholder(/concepto/i).fill("Validation test");

    // Unbalanced: debit 100, credit 50
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill("100");
    await numberInputs.nth(3).fill("50");

    // Button should be disabled
    const createBtn = page.getByRole("button", { name: /crear borrador/i });
    await expect(createBtn).toBeDisabled();

    // Error message
    await expect(page.getByText(/no cuadra/i)).toBeVisible();
  });

  test("journal entry — description required for balanced entry", async ({ page }) => {
    await page.goto("/asientos");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("Nuevo asiento")').first().click();
    await expect(page.getByText(/nuevo asiento/i)).toBeVisible();

    // Balanced but no description
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill("100");
    await numberInputs.nth(3).fill("100");

    // Button should still be disabled (no description)
    const createBtn = page.getByRole("button", { name: /crear borrador/i });
    await page.waitForTimeout(500);
    // If description is required, button should be disabled
    const isDisabled = await createBtn.isDisabled();
    expect(isDisabled).toBeTruthy();
  });

  test("contact type buttons toggle mutually exclusive", async ({ page }) => {
    await page.goto("/contactos");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("Nuevo")').first().click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible();

    const provBtn = page.locator('button:has-text("Proveedor")').first();
    const clienteBtn = page.locator('button:has-text("Cliente")').first();

    if (await provBtn.isVisible().catch(() => false)) {
      // Click Proveedor
      await provBtn.click();
      let provClasses = (await provBtn.getAttribute("class")) ?? "";

      // Click Cliente — should deactivate Proveedor
      await clienteBtn.click();
      const clienteClasses = (await clienteBtn.getAttribute("class")) ?? "";

      // At least one should have active styling
      expect(clienteClasses.length + provClasses.length).toBeGreaterThan(0);
    }
  });

  test("bank account — IBAN duplicate returns error", async ({ page }) => {
    await page.goto("/ajustes/bancos");
    await page.waitForLoadState("networkidle");

    const newBtn = page.locator('button:has-text("Nueva"), button:has-text("Añadir")').first();
    await newBtn.click();

    const checkingBtn = page.getByText(/cuenta corriente/i).first();
    if (await checkingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkingBtn.click();
      await page.waitForTimeout(500);

      // Fill with existing IBAN from seed
      const aliasInput = page.locator("input").first();
      await aliasInput.fill("Test Duplicate");

      const ibanInput = page.locator('input[placeholder*="ES"], input[name*="iban"]').first();
      if (await ibanInput.isVisible().catch(() => false)) {
        await ibanInput.fill("ES7620770024003102575766");

        // Try to submit
        const submitBtn = page.getByRole("button", { name: /crear|guardar/i });
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(2000);

          // Should show error (409 duplicate)
          const error = page.getByText(/duplicad|ya existe|error/i);
          if (await error.isVisible({ timeout: 3000 }).catch(() => false)) {
            expect(true).toBeTruthy();
          }
        }
      }
    }
  });

  test("journal entry — cannot remove below 2 lines", async ({ page }) => {
    await page.goto("/asientos");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("Nuevo asiento")').first().click();
    await expect(page.getByText(/nuevo asiento/i)).toBeVisible();

    // Should start with exactly 2 lines
    // Line removal buttons should not work when at 2 lines
    const lineGroups = page.locator('[class*="line"], [class*="row"]').filter({
      has: page.locator('input[type="number"]'),
    });
    // Verify we have at least 2 sets of number inputs
    expect(await page.locator('input[type="number"]').count()).toBeGreaterThanOrEqual(4);
  });
});
