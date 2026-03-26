import { test as setup, expect } from "@playwright/test";

const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "1234";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Fill login form
  await page.getByLabel(/email/i).fill(DEMO_EMAIL);
  await page.getByLabel(/contraseña/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /iniciar/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("/", { timeout: 15000 });
  await expect(page.locator("nav")).toBeVisible({ timeout: 10000 });

  // Save authenticated state
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
