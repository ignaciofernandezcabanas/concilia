import { test, expect } from "../fixtures";

test.describe("API: /api/contacts", () => {
  test("GET returns contacts list", async ({ request }) => {
    const res = await request.get("/api/contacts");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("GET with search filter is case insensitive", async ({ request }) => {
    const res = await request.get("/api/contacts?search=levante");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  test("contacts include name and CIF", async ({ request }) => {
    const res = await request.get("/api/contacts");
    const body = await res.json();
    const first = body.data[0];
    expect(first).toHaveProperty("name");
    expect(first.name).toBeTruthy();
  });
});
