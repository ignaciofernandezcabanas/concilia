import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  // Use fresh context without auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows login form with all elements", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /iniciar/i })).toBeVisible();
  });

  test("shows OAuth provider buttons", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Google/)).toBeVisible();
    await expect(page.getByText(/Microsoft/)).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/email/i).fill("wrong@example.com");
    await page.getByLabel(/contraseña/i).fill("wrongpassword");
    await page.getByRole("button", { name: /iniciar/i }).click();

    // Error message should appear (translated via getAuthErrorMessage)
    await expect(page.getByText(/(credenciales|contraseña|error|incorrecto)/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/email/i).fill("admin@example.com");
    await page.getByLabel(/contraseña/i).fill("1234");
    await page.getByRole("button", { name: /iniciar/i }).click();

    await page.waitForURL("/", { timeout: 15000 });
    await expect(page.locator("nav")).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated user is redirected from protected page", async ({ page }) => {
    await page.goto("/facturas");
    // Should redirect to login
    await page.waitForURL("**/login**", { timeout: 10000 });
  });
});
