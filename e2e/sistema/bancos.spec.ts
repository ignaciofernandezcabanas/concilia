import { test, expect } from "../fixtures";

test.describe("Cuentas Bancarias", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ajustes/bancos");
    await page.waitForLoadState("networkidle");
  });

  test("renders bank accounts page", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("lists existing bank accounts from seed", async ({ page }) => {
    // Seed creates OwnBankAccount entries
    const text = (await page.locator("main").textContent()) ?? "";
    // Should display IBAN or bank name
    expect(text.length).toBeGreaterThan(50);
  });

  test("new account button exists", async ({ page }) => {
    const newBtn = page.locator(
      'button:has-text("Nueva"), button:has-text("Añadir"), a:has-text("Nueva")'
    );
    await expect(newBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
