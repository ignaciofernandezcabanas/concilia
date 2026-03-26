import { test, expect } from "../fixtures";

const SIDEBAR_LINKS = [
  // DIARIO
  { label: "Resumen", href: "/" },
  { label: "Conciliación", href: "/conciliacion" },
  { label: "Seguimientos", href: "/seguimientos" },
  { label: "Movimientos", href: "/movimientos" },
  { label: "Facturas", href: "/facturas" },
  { label: "Docs. soporte", href: "/documentos-soporte" },
  { label: "Contactos", href: "/contactos" },
  // CONTABILIDAD
  { label: "Asientos", href: "/asientos" },
  { label: "Plan de cuentas", href: "/plan-cuentas" },
  { label: "Activos", href: "/activos" },
  { label: "Periodificaciones", href: "/periodificaciones" },
  { label: "Inversiones", href: "/inversiones" },
  // REPORTING
  { label: "PyG", href: "/pyg" },
  { label: "Balance", href: "/balance" },
  { label: "Cashflow", href: "/cashflow" },
  { label: "Tesorería", href: "/tesoreria" },
  { label: "Deuda", href: "/deuda" },
  { label: "Cuentas a cobrar", href: "/cuentas-cobrar" },
  { label: "Fiscal", href: "/fiscal" },
  // SISTEMA
  { label: "Cuentas bancarias", href: "/ajustes/bancos" },
  { label: "Reglas", href: "/reglas" },
  { label: "Gestoría", href: "/gestoria" },
  { label: "Notificaciones", href: "/notificaciones" },
  { label: "Ajustes", href: "/ajustes" },
];

test.describe("Sidebar Navigation", () => {
  test("all sidebar links navigate to correct pages", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const { label, href } of SIDEBAR_LINKS) {
      const link = page.locator(`nav a:has-text("${label}")`).first();
      await expect(link).toBeVisible({ timeout: 5000 });
      await link.click();
      await page.waitForURL(`**${href}`, { timeout: 10000 });
      await page.waitForLoadState("networkidle");
    }
  });

  test("sidebar highlights active link", async ({ page }) => {
    await page.goto("/facturas");
    await page.waitForLoadState("networkidle");
    const activeLink = page.locator('nav a[href="/facturas"]');
    await expect(activeLink).toBeVisible();
    // Active link should have a background color class
    const classes = await activeLink.getAttribute("class");
    expect(classes).toMatch(/bg-/);
  });
});
