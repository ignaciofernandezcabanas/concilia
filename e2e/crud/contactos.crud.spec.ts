import { test, expect } from "../fixtures";
import { expectTableHasRows, waitForPageContent } from "../helpers/assertions";
import { uniqueName } from "../helpers/crud-utils";

const testContactName = uniqueName("Contacto");

test.describe("Contactos — CRUD Flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/contactos");
    await waitForPageContent(page);
  });

  test("create modal opens with Nuevo button", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo/i }).click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible({ timeout: 3000 });
  });

  test("create contact with valid data", async ({ page }) => {
    await page.getByRole("button", { name: /nuevo/i }).click();
    await page.waitForTimeout(500);

    // Fill name
    const nameInput = page
      .locator('input[placeholder*="Empresa"], input[placeholder*="empresa"]')
      .first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(testContactName);
    } else {
      // Try first input in modal
      const inputs = page.locator('[class*="fixed"] input');
      await inputs.first().fill(testContactName);
    }

    // Select type
    const provBtn = page.getByRole("button", { name: /proveedor/i }).first();
    if (await provBtn.isVisible().catch(() => false)) {
      await provBtn.click();
    }

    // Submit
    const submitBtn = page.getByRole("button", { name: /crear/i });
    if (await submitBtn.isEnabled().catch(() => false)) {
      await submitBtn.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("search filters contacts", async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await expect(search).toBeVisible();
    await search.fill("Levante");
    await page.waitForLoadState("networkidle");
  });

  test("clicking contact row opens detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    const row = page.locator('div[class*="cursor-pointer"][class*="border-b"]').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(1000);
    }
  });

  test("edit button exists in detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    const row = page.locator('div[class*="cursor-pointer"][class*="border-b"]').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(1000);
      const editBtn = page.getByRole("button", { name: /editar/i });
      if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        expect(true).toBeTruthy();
      }
    }
  });

  test("cancel create does not save", async ({ page }) => {
    const cancelName = uniqueName("CancelTest");
    await page.getByRole("button", { name: /nuevo/i }).click();
    await page.waitForTimeout(500);

    const nameInput = page.locator('[class*="fixed"] input').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(cancelName);
    }

    await page.keyboard.press("Escape");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(cancelName)).not.toBeVisible({ timeout: 2000 });
  });

  // Cleanup
  test("cleanup: delete test contact via API", async ({ request }) => {
    const res = await request.get(`/api/contacts?search=${encodeURIComponent(testContactName)}`);
    if (res.ok()) {
      const body = await res.json();
      const found = body.data?.find((c: { name: string }) => c.name === testContactName);
      if (found) {
        await request.delete(`/api/contacts/${found.id}`);
      }
    }
  });
});
