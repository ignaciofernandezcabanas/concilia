import { test, expect } from "../fixtures";

test.describe("Logout", () => {
  test("clicking logout redirects to login page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find and click the logout button in sidebar
    const logoutBtn = page
      .locator("button")
      .filter({ has: page.locator('svg, :text-matches("salir|cerrar", "i")') })
      .last();

    // If there's a button with LogOut icon, click it
    const logoutIcon = page
      .locator('button:has(svg[class*="log-out"]), button:has-text("Cerrar sesión")')
      .first();
    if (await logoutIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutIcon.click();
    } else {
      await logoutBtn.click();
    }

    await page.waitForURL("**/login**", { timeout: 10000 });
  });
});
