import { test, expect } from "../fixtures";

test.describe("Logout", () => {
  test("clicking logout redirects to login page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Logout button has title="Cerrar sesión"
    const logoutBtn = page.locator('button[title="Cerrar sesión"]');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();

    await page.waitForURL("**/login**", { timeout: 10000 });
  });
});
