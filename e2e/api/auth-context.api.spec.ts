import { test, expect } from "../fixtures";

test.describe("API: /api/auth/context", () => {
  test("GET returns user context with memberships", async ({ request }) => {
    const res = await request.get("/api/auth/context");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.memberships).toBeInstanceOf(Array);
    expect(body.memberships.length).toBeGreaterThan(0);
  });
});
