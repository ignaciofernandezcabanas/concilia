import { test, expect } from "../fixtures";

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, "0");
const from = `${year}-${month}-01`;
const to = `${year}-${month}-28`;

test.describe("API: Report Endpoints", () => {
  test("GET /api/reports/dashboard returns data", async ({ request }) => {
    const res = await request.get("/api/reports/dashboard");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/pyg returns P&L data", async ({ request }) => {
    const res = await request.get(`/api/reports/pyg?from=${from}&to=${to}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/balance returns balance sheet", async ({ request }) => {
    const res = await request.get(`/api/reports/balance?date=${to}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/cashflow returns cash flow", async ({ request }) => {
    const res = await request.get(`/api/reports/cashflow?from=${from}&to=${to}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/forecast returns treasury forecast", async ({ request }) => {
    const res = await request.get("/api/reports/forecast");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/aging returns aging data", async ({ request }) => {
    const res = await request.get("/api/reports/aging");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/reports/trial-balance returns data", async ({ request }) => {
    const res = await request.get(`/api/reports/trial-balance?from=${from}&to=${to}`);
    expect(res.ok()).toBeTruthy();
  });
});
