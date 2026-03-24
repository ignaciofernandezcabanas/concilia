import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAllInvoices = vi.hoisted(() => vi.fn());
const mockGetAllPurchases = vi.hoisted(() => vi.fn());

vi.mock("@/lib/holded/client", () => {
  return {
    HoldedClient: class {
      getAllInvoices = mockGetAllInvoices;
      getAllPurchases = mockGetAllPurchases;
    },
  };
});

const mockDb = {
  invoice: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contact: { findFirst: vi.fn(), upsert: vi.fn() },
  invoiceLine: { deleteMany: vi.fn() },
  syncLog: { create: vi.fn(), findFirst: vi.fn() },
};

import { syncInvoices } from "@/lib/holded/sync-invoices";

describe("Sync Invoices (Holded)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.invoice.findFirst.mockResolvedValue(null);
    mockDb.invoice.findUnique.mockResolvedValue(null);
    mockDb.invoice.upsert.mockResolvedValue({ id: "inv_1" });
    mockDb.invoice.create.mockResolvedValue({ id: "inv_1" });
    mockDb.invoice.update.mockResolvedValue({ id: "inv_1" });
    mockDb.contact.findFirst.mockResolvedValue(null);
    mockDb.contact.upsert.mockResolvedValue({ id: "c_1" });
    mockDb.invoiceLine.deleteMany.mockResolvedValue({});
    mockDb.syncLog.create.mockResolvedValue({});
    mockDb.syncLog.findFirst.mockResolvedValue(null);
    mockGetAllInvoices.mockResolvedValue([]);
    mockGetAllPurchases.mockResolvedValue([]);
  });

  it("factura nueva → upsert create", async () => {
    mockGetAllInvoices.mockResolvedValue([
      {
        id: "h_inv_1",
        docNumber: "FRA-001",
        date: 1709251200,
        total: 1210,
        subtotal: 1000,
        tax: 210,
        status: 1,
        contactId: "h_c1",
        contactName: "Cliente SA",
        items: [{ description: "Servicio", units: 1, subtotal: 1000, tax: 210, total: 1210 }],
      },
    ]);

    const result = await syncInvoices(mockDb as any, "company_1", "api-key-123");
    expect(result.created + result.updated).toBeGreaterThanOrEqual(1);
  });

  it("API vacía → 0 cambios", async () => {
    const result = await syncInvoices(mockDb as any, "company_1", "api-key-123");
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });

  it("API error → throw", async () => {
    mockGetAllInvoices.mockRejectedValue(new Error("500 Internal Server Error"));
    await expect(syncInvoices(mockDb as any, "company_1", "bad-key")).rejects.toThrow();
  });
});
