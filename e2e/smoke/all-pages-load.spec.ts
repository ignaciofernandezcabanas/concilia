import { test, expect } from "../fixtures";
import { expectPageLoads } from "../helpers/assertions";

const AUTHENTICATED_PAGES = [
  { path: "/", name: "Dashboard" },
  { path: "/conciliacion", name: "Conciliación" },
  { path: "/seguimientos", name: "Seguimientos" },
  { path: "/movimientos", name: "Movimientos" },
  { path: "/facturas", name: "Facturas" },
  { path: "/documentos-soporte", name: "Docs. soporte" },
  { path: "/contactos", name: "Contactos" },
  { path: "/asientos", name: "Asientos" },
  { path: "/plan-cuentas", name: "Plan de cuentas" },
  { path: "/activos", name: "Activos" },
  { path: "/periodificaciones", name: "Periodificaciones" },
  { path: "/inversiones", name: "Inversiones" },
  { path: "/pyg", name: "PyG" },
  { path: "/balance", name: "Balance" },
  { path: "/cashflow", name: "Cashflow" },
  { path: "/tesoreria", name: "Tesorería" },
  { path: "/deuda", name: "Deuda" },
  { path: "/cuentas-cobrar", name: "Cuentas a cobrar" },
  { path: "/fiscal", name: "Fiscal" },
  { path: "/ajustes", name: "Ajustes" },
  { path: "/ajustes/bancos", name: "Cuentas bancarias" },
  { path: "/reglas", name: "Reglas" },
  { path: "/gestoria", name: "Gestoría" },
  { path: "/notificaciones", name: "Notificaciones" },
];

const PUBLIC_PAGES = [
  { path: "/login", name: "Login" },
  { path: "/landing", name: "Landing" },
  { path: "/para-gestorias", name: "Para Gestorías" },
];

for (const { path, name } of AUTHENTICATED_PAGES) {
  test(`[SMOKE] ${name} (${path}) loads without errors`, async ({ page }) => {
    await expectPageLoads(page, path);
  });
}

for (const { path, name } of PUBLIC_PAGES) {
  test(`[SMOKE] ${name} (${path}) loads without errors`, async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto(`http://localhost:3000${path}`, {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBeLessThan(500);
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
    await ctx.close();
  });
}
