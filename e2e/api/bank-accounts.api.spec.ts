import { test, expect } from "../fixtures";

test.describe("API: /api/bank-accounts", () => {
  test("GET returns bank accounts list", async ({ request }) => {
    const res = await request.get("/api/bank-accounts");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/bank-accounts/detect-bank detects bank from IBAN", async ({ request }) => {
    const res = await request.get("/api/bank-accounts/detect-bank?iban=ES7620770024003102575766");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.bankName).toBeDefined();
  });
});
