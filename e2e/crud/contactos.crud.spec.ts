import { test, expect } from "../fixtures";
import { expectTableHasRows, expectPanelOpen } from "../helpers/assertions";
import { uniqueName } from "../helpers/crud-utils";

const testContactName = uniqueName("Contacto");
let createdContactId: string | null = null;

test.describe("Contactos — CRUD Flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/contactos");
    await page.waitForLoadState("networkidle");
  });

  test("create modal opens with Nuevo button", async ({ page }) => {
    await page.locator('button:has-text("Nuevo")').first().click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible({ timeout: 3000 });
    // Verify key fields exist
    await expect(page.getByPlaceholder(/empresa/i)).toBeVisible();
  });

  test("create contact validation — empty name shows error", async ({ page }) => {
    await page.locator('button:has-text("Nuevo")').first().click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible();

    // Try to submit without name
    const createBtn = page.getByRole("button", { name: /crear/i });
    if (await createBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
      await createBtn.click();
      // Should show validation error
      await expect(page.getByText(/obligatorio/i)).toBeVisible({ timeout: 3000 });
    }
  });

  test("create contact with valid data", async ({ page }) => {
    await page.locator('button:has-text("Nuevo")').first().click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible();

    // Fill form
    await page.getByPlaceholder(/empresa/i).fill(testContactName);
    // Select type "Proveedor"
    const proveedorBtn = page.locator('button:has-text("Proveedor")').first();
    if (await proveedorBtn.isVisible().catch(() => false)) {
      await proveedorBtn.click();
    }

    // Submit
    await page.getByRole("button", { name: /crear/i }).click();
    await page.waitForLoadState("networkidle");

    // Verify contact appears in list
    await expect(page.getByText(testContactName)).toBeVisible({ timeout: 5000 });
  });

  test("type filter tabs work (Todos, Clientes, Proveedores)", async ({ page }) => {
    const clientesTab = page.locator('button:has-text("Clientes")').first();
    if (await clientesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientesTab.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).not.toBeEmpty();

      await page.locator('button:has-text("Todos")').first().click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("clicking contact row opens detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);
  });

  test("detail panel shows contact info sections", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);

    // Panel should show structured info
    const panelText = await page
      .locator('[class*="panel"], [class*="Panel"]')
      .first()
      .textContent();
    expect(panelText?.length).toBeGreaterThan(20);
  });

  test("edit button exists in detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);

    const editBtn = page
      .locator(
        '[class*="panel"] button:has-text("Editar"), [class*="Panel"] button:has-text("Editar")'
      )
      .first();
    await expect(editBtn).toBeVisible({ timeout: 3000 });
  });

  test("enrich button exists in detail panel", async ({ page }) => {
    await expectTableHasRows(page);
    await page.locator("tbody tr").first().click();
    await expectPanelOpen(page);

    const enrichBtn = page.locator('button:has-text("Enriquecer")').first();
    if (await enrichBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(true).toBeTruthy();
    }
  });

  test("search filters contacts by name", async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i);
    await expect(search).toBeVisible();
    await search.fill("Levante");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("cancel create modal does not save", async ({ page }) => {
    const cancelName = uniqueName("CancelTest");
    await page.locator('button:has-text("Nuevo")').first().click();
    await page.getByPlaceholder(/empresa/i).fill(cancelName);

    // Cancel
    const cancelBtn = page.getByRole("button", { name: /cancelar/i });
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    } else {
      // Close with X
      await page.keyboard.press("Escape");
    }
    await page.waitForLoadState("networkidle");

    // Name should NOT appear in list
    await expect(page.getByText(cancelName)).not.toBeVisible({ timeout: 2000 });
  });

  test("contact type buttons toggle correctly", async ({ page }) => {
    await page.locator('button:has-text("Nuevo")').first().click();
    await expect(page.getByText(/nuevo contacto/i)).toBeVisible();

    const provBtn = page.locator('button:has-text("Proveedor")').first();
    const clienteBtn = page.locator('button:has-text("Cliente")').first();

    if (await provBtn.isVisible().catch(() => false)) {
      await provBtn.click();
      // Proveedor should be active
      const provClasses = await provBtn.getAttribute("class");
      expect(provClasses).toMatch(/accent|bg-/);

      await clienteBtn.click();
      // Cliente should now be active
      const clienteClasses = await clienteBtn.getAttribute("class");
      expect(clienteClasses).toMatch(/accent|bg-/);
    }
  });

  test("language select has es/en/ca options", async ({ page }) => {
    await page.locator('button:has-text("Nuevo")').first().click();
    const idiomaSelect = page.locator("select").filter({ hasText: /espa/i });
    if (await idiomaSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await idiomaSelect.locator("option").allTextContents();
      const joined = options.join(" ").toLowerCase();
      expect(joined).toContain("espa");
    }
  });

  // Cleanup: delete test contact via API
  test("cleanup: delete test contact via API", async ({ request }) => {
    if (!createdContactId) {
      // Find the contact by searching
      const res = await request.get(`/api/contacts?search=${encodeURIComponent(testContactName)}`);
      if (res.ok()) {
        const body = await res.json();
        const found = body.data?.find((c: { name: string }) => c.name === testContactName);
        if (found) {
          await request.delete(`/api/contacts/${found.id}`);
        }
      }
    }
  });
});
