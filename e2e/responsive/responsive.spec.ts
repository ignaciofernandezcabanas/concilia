import { test, expect } from "../fixtures";
import { waitForPageContent } from "../helpers/assertions";

test.describe("Responsive — Mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("facturas page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/facturas");
    await waitForPageContent(page);
    expect(errors).toHaveLength(0);
  });

  test("conciliacion page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/conciliacion");
    await waitForPageContent(page);
    expect(errors).toHaveLength(0);
  });
});

test.describe("Responsive — Tablet (768px)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("key pages render without body overflow", async ({ page }) => {
    for (const path of ["/facturas", "/conciliacion"]) {
      await page.goto(path);
      await waitForPageContent(page);
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
    }
  });
});

test.describe("Responsive — Desktop (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("sidebar is visible and has proper width", async ({ page }) => {
    await page.goto("/");
    await waitForPageContent(page);
    const aside = page.locator("aside").first();
    await expect(aside).toBeVisible();
    const box = await aside.boundingBox();
    expect(box).toBeDefined();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(180);
    }
  });
});
