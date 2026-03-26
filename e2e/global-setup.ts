import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "1234";
const AUTH_FILE = path.join(__dirname, "playwright/.auth/user.json");

// Ensure the auth file exists (empty valid state) before Playwright reads it
fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
if (!fs.existsSync(AUTH_FILE)) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  // Wait for login form to be ready
  await page.locator("#login-email").waitFor({ timeout: 15000 });

  // Fill login form using exact IDs from login/page.tsx
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);

  // Click submit - button text is "Iniciar sesión"
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard
  await page.waitForURL("/", { timeout: 15000 });
  // Wait for sidebar to render
  await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });

  // Save authenticated state
  await page.context().storageState({ path: AUTH_FILE });
});
