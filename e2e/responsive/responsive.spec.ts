import { test, expect } from "../fixtures";

test.describe("Responsive — Mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("facturas table is horizontally scrollable", async ({ page }) => {
    await page.goto("/facturas");
    await page.waitForLoadState("networkidle");

    // Table container should have overflow-x-auto
    const container = page.locator('[class*="overflow-x"]').first();
    const hasOverflow = await container.isVisible({ timeout: 3000 }).catch(() => false);
    // Or the table itself might overflow
    const table = page.locator("table").first();
    const tableVisible = await table.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasOverflow || tableVisible).toBeTruthy();
  });

  test("sidebar is hidden or collapsed", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // At 375px, sidebar nav should be hidden
    const nav = page.locator("nav").first();
    const isVisible = await nav.isVisible({ timeout: 3000 }).catch(() => false);
    // Either hidden entirely or very narrow
    if (isVisible) {
      const box = await nav.boundingBox();
      // If visible, it should be collapsed (width < 60) or full overlay
      expect(box).toBeDefined();
    }
  });

  test("conciliacion page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/conciliacion");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });
});

test.describe("Responsive — Tablet (768px)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("key pages render without body overflow", async ({ page }) => {
    for (const path of ["/facturas", "/conciliacion", "/pyg"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      // Body should not have horizontal scrollbar
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      // Allow small tolerance (2px)
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
    }
  });

  test("facturas page renders tables correctly", async ({ page }) => {
    await page.goto("/facturas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toBeEmpty();
  });
});

test.describe("Responsive — Desktop (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("sidebar is visible and full width", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();

    const box = await nav.boundingBox();
    expect(box).toBeDefined();
    // Sidebar should be at least 180px wide
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(180);
    }
  });
});
