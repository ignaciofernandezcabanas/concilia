import { describe, it, expect } from "vitest";
import { buildBankTransaction, buildInvoice, buildCompany } from "../helpers/factories";

describe("Test setup", () => {
  it("factories produce valid objects", () => {
    const tx = buildBankTransaction();
    expect(tx.id).toBe("tx_1");
    expect(tx.amount).toBe(-1000);
    expect(tx.companyId).toBe("company_1");

    const inv = buildInvoice();
    expect(inv.totalAmount).toBe(1000);
    expect(inv.contact?.iban).toBe(tx.counterpartIban);

    const company = buildCompany();
    expect(company.autoApproveThreshold).toBe(0.9);
  });

  it("factories accept overrides", () => {
    const tx = buildBankTransaction({ amount: 500, status: "RECONCILED" });
    expect(tx.amount).toBe(500);
    expect(tx.status).toBe("RECONCILED");
  });
});
