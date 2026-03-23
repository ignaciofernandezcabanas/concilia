import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the HoldedClient class
const mockGetAccounts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/holded/client", () => {
  return {
    HoldedClient: class {
      getAccounts = mockGetAccounts;
    },
  };
});

const mockDb = {
  account: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  syncLog: { create: vi.fn() },
};

import { syncAccounts } from "@/lib/holded/sync-accounts";

describe("Sync Accounts (Holded)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.account.findMany.mockResolvedValue([]);
    mockDb.account.upsert.mockResolvedValue({});
    mockDb.account.update.mockResolvedValue({});
    mockDb.account.updateMany.mockResolvedValue({});
    mockDb.syncLog.create.mockResolvedValue({});
  });

  it("llama a HoldedClient.getAccounts", async () => {
    mockGetAccounts.mockResolvedValue([]);

    await syncAccounts(mockDb as any, "company_1", "api-key-123");
    expect(mockGetAccounts).toHaveBeenCalled();
  });

  it("registra syncLog", async () => {
    mockGetAccounts.mockResolvedValue([]);
    await syncAccounts(mockDb as any, "company_1", "api-key-123");
    expect(mockDb.syncLog.create).toHaveBeenCalled();
  });

  it("API error → throw", async () => {
    mockGetAccounts.mockRejectedValue(new Error("401 Unauthorized"));
    await expect(syncAccounts(mockDb as any, "company_1", "bad-key")).rejects.toThrow();
  });
});
