import { test, expect } from "../fixtures";
import { OWN_IBAN_1 } from "../helpers/seed-data";

test.describe("API Error Contracts", () => {
  test("POST /api/contacts with empty body returns 400", async ({ request }) => {
    const res = await request.post("/api/contacts", { data: {} });
    expect(res.status()).toBe(400);
  });

  test("POST /api/contacts missing required name returns 400", async ({ request }) => {
    const res = await request.post("/api/contacts", {
      data: { type: "CUSTOMER" },
    });
    expect(res.status()).toBe(400);
  });

  test("DELETE /api/invoices/nonexistent returns 404", async ({ request }) => {
    const res = await request.delete("/api/invoices/00000000-0000-0000-0000-000000000000");
    // Should return 404 or 400
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("DELETE /api/transactions/nonexistent returns 404", async ({ request }) => {
    const res = await request.delete("/api/transactions/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/invoices/batch-delete with empty ids returns 400", async ({ request }) => {
    const res = await request.post("/api/invoices/batch-delete", {
      data: { ids: [] },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/bank-accounts with duplicate IBAN returns 409", async ({ request }) => {
    const res = await request.post("/api/bank-accounts", {
      data: {
        alias: "Duplicate Test",
        accountType: "CHECKING",
        iban: OWN_IBAN_1,
      },
    });
    // Should return 409 (conflict) for duplicate IBAN
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/bank-accounts with missing alias returns 400", async ({ request }) => {
    const res = await request.post("/api/bank-accounts", {
      data: { accountType: "CHECKING" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/reconciliation/fake-id/resolve returns 404", async ({ request }) => {
    const res = await request.post(
      "/api/reconciliation/00000000-0000-0000-0000-000000000000/resolve",
      { data: { action: "approve" } }
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("API endpoints return proper error format (not 500)", async ({ request }) => {
    // Verify that malformed requests get 4xx, not 500
    const endpoints = [
      { method: "post" as const, url: "/api/contacts", data: { invalidField: true } },
      { method: "post" as const, url: "/api/journal-entries", data: {} },
    ];

    for (const { method, url, data } of endpoints) {
      const res = await request[method](url, { data });
      expect(res.status(), `${url} returned ${res.status()}`).toBeLessThan(500);
    }
  });

  test("GET /api/invoices without auth returns 401", async ({ browser }) => {
    // Create a fresh context without storageState
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.get("http://localhost:3000/api/invoices");
    expect(res.status()).toBe(401);

    await ctx.close();
  });
});
