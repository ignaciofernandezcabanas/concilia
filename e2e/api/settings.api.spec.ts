import { test, expect } from "../fixtures";

test.describe("API: Settings Endpoints", () => {
  test("GET /api/settings/company returns company data", async ({ request }) => {
    const res = await request.get("/api/settings/company");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.name).toBeDefined();
  });

  test("GET /api/settings/accounts returns PGC accounts", async ({ request }) => {
    const res = await request.get("/api/settings/accounts");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/settings/thresholds returns threshold config", async ({ request }) => {
    const res = await request.get("/api/settings/thresholds");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/settings/rules returns matching rules", async ({ request }) => {
    const res = await request.get("/api/settings/rules");
    expect(res.ok()).toBeTruthy();
  });
});
