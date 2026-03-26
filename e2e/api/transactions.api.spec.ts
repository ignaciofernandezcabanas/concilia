import { test, expect } from "../fixtures";

test.describe("API: /api/transactions", () => {
  test("GET returns paginated transaction list", async ({ request }) => {
    const res = await request.get("/api/transactions");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBeGreaterThan(0);
  });

  test("GET with search filter returns results", async ({ request }) => {
    const res = await request.get("/api/transactions?search=NOMINA");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  test("GET with status filter works", async ({ request }) => {
    const res = await request.get("/api/transactions?status=PENDING");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  test("GET with pagination works", async ({ request }) => {
    const res = await request.get("/api/transactions?page=1&pageSize=5");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.length).toBeLessThanOrEqual(5);
  });
});
