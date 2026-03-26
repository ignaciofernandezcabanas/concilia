import { test, expect } from "../fixtures";

test.describe("API: Reconciliation Endpoints", () => {
  test("GET /api/reports/reconciliation-report returns data", async ({ request }) => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-28`;
    const res = await request.get(`/api/reports/reconciliation-report?from=${from}&to=${to}`);
    expect(res.ok()).toBeTruthy();
  });
});
