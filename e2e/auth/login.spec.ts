import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows login form with all elements", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: /iniciar sesión/i })).toBeVisible();
  });

  test("shows OAuth provider buttons", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Continuar con Google")).toBeVisible();
    await expect(page.getByText("Continuar con Microsoft")).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.locator("#login-email").fill("wrong@example.com");
    await page.locator("#login-password").fill("wrongpassword");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    // Error message should appear (translated via getAuthErrorMessage)
    await expect(page.getByText(/(credenciales|contraseña|error|incorrecto|Invalid)/i)).toBeVisible(
      { timeout: 5000 }
    );
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.locator("#login-email").fill("admin@example.com");
    await page.locator("#login-password").fill("1234");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    await page.waitForURL("/", { timeout: 15000 });
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated user is redirected from protected page", async ({ page }) => {
    await page.goto("/facturas");
    await page.waitForURL("**/login**", { timeout: 10000 });
  });
});
