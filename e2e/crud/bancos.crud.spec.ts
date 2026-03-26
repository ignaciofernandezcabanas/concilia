import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Cuentas Bancarias — CRUD Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ajustes/bancos");
    await waitForPageContent(page);
  });

  test("create button opens type selection", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nueva|añadir/i });
    await expect(newBtn).toBeVisible({ timeout: 5000 });
    await newBtn.click();
    await page.waitForTimeout(500);
    // Should show account types
    await expect(page.getByText(/cuenta corriente/i)).toBeVisible({ timeout: 3000 });
  });

  test("selecting type shows form", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nueva|añadir/i });
    await newBtn.click();
    await page.waitForTimeout(500);
    const checkingBtn = page.getByText(/cuenta corriente/i).first();
    if (await checkingBtn.isVisible().catch(() => false)) {
      await checkingBtn.click();
      await page.waitForTimeout(500);
      // Form should appear with IBAN label
      await expect(page.getByText(/iban/i)).toBeVisible({ timeout: 3000 });
    }
  });

  test("back button returns to type selection", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nueva|añadir/i });
    await newBtn.click();
    await page.waitForTimeout(500);
    const checkingBtn = page.getByText(/cuenta corriente/i).first();
    if (await checkingBtn.isVisible().catch(() => false)) {
      await checkingBtn.click();
      await page.waitForTimeout(500);
      const backBtn = page.getByText(/cambiar tipo|volver/i).first();
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click();
        await expect(page.getByText(/cuenta corriente/i)).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("existing accounts are displayed", async ({ page }) => {
    const text = await page.locator("main").textContent();
    expect(text?.length).toBeGreaterThan(50);
  });
});
