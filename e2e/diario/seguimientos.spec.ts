import { test, expect } from "../fixtures";

test.describe("Seguimientos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/seguimientos");
    await page.waitForLoadState("networkidle");
  });

  test("page loads and renders content", async ({ page }) => {
    await expect(page.locator("main")).not.toBeEmpty();
  });

  test("thread list or empty state is visible", async ({ page }) => {
    // Either shows a list of threads or an empty state message
    const hasContent =
      (await page.locator("tbody tr").count()) > 0 ||
      (await page
        .getByText(/no hay|vacío|sin seguimientos/i)
        .isVisible()
        .catch(() => false));
    expect(hasContent).toBeTruthy();
  });
});
