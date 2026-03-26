import { test, expect } from "../fixtures";

const year = new Date().getFullYear();
const q1From = `${year}-01-01`;
const q1To = `${year}-03-31`;

test.describe("API: Fiscal Endpoints", () => {
  test("GET /api/reports/fiscal/303 returns IVA data", async ({ request }) => {
    const res = await request.get(`/api/reports/fiscal/303?from=${q1From}&to=${q1To}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/fiscal/111 returns withholding data", async ({ request }) => {
    const res = await request.get(`/api/reports/fiscal/111?from=${q1From}&to=${q1To}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/fiscal/115 returns rent withholding", async ({ request }) => {
    const res = await request.get(`/api/reports/fiscal/115?from=${q1From}&to=${q1To}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/fiscal/390 returns annual summary", async ({ request }) => {
    const res = await request.get(`/api/reports/fiscal/390?year=${year}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/fiscal/is returns corporate tax", async ({ request }) => {
    const res = await request.get(`/api/reports/fiscal/is?year=${year}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/fiscal/calendar returns fiscal calendar", async ({ request }) => {
    const res = await request.get(`/api/reports/fiscal/calendar?year=${year}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/fiscal/obligations returns obligations", async ({ request }) => {
    const res = await request.get(`/api/fiscal/obligations?year=${year}`);
    expect(res.ok()).toBeTruthy();
  });
});
