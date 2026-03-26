import { test, expect } from "../fixtures";

test.describe("API: /api/journal-entries", () => {
  test("GET returns journal entries list", async ({ request }) => {
    const res = await request.get("/api/journal-entries");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });
});
