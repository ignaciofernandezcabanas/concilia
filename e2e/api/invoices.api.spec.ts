import { test, expect } from "../fixtures";

test.describe("API: /api/invoices", () => {
  test("GET returns invoice list with contact and lines", async ({ request }) => {
    const res = await request.get("/api/invoices");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);

    // Each invoice should include contact and lines
    const first = body.data[0];
    expect(first).toHaveProperty("contact");
    expect(first).toHaveProperty("lines");
  });

  test("GET with type=ISSUED filter works", async ({ request }) => {
    const res = await request.get("/api/invoices?type=ISSUED");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    for (const inv of body.data) {
      expect(inv.type).toBe("ISSUED");
    }
  });

  test("GET with type=RECEIVED filter works", async ({ request }) => {
    const res = await request.get("/api/invoices?type=RECEIVED");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const inv of body.data) {
      expect(inv.type).toBe("RECEIVED");
    }
  });

  test("GET includes aggregate totalAmount", async ({ request }) => {
    const res = await request.get("/api/invoices");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.aggregate).toBeDefined();
  });

  test("GET with search filter works", async ({ request }) => {
    const res = await request.get("/api/invoices?search=FRA");
    expect(res.ok()).toBeTruthy();
  });
});
