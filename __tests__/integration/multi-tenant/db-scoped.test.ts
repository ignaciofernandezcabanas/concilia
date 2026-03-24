import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the underlying prisma client
const mockQuery = vi.fn();
const mockPrisma = vi.hoisted(() => ({
  $extends: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { getScopedDb, getGroupDb } from "@/lib/db-scoped";

describe("getScopedDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Capture the extension config
    mockPrisma.$extends.mockImplementation((config) => {
      return { _extensionConfig: config };
    });
  });

  it("creates a prisma extension with query overrides", () => {
    const db = getScopedDb("company_1");
    expect(mockPrisma.$extends).toHaveBeenCalledTimes(1);
    const config = (db as unknown as { _extensionConfig: { query: Record<string, unknown> } })
      ._extensionConfig;
    expect(config.query).toBeDefined();
    expect((config.query as Record<string, unknown>).$allModels).toBeDefined();
  });

  it("injects companyId in findMany for scoped models", async () => {
    mockPrisma.$extends.mockImplementation((config) => {
      // Simulate calling the findMany override
      const handler = config.query.$allModels.findMany;
      return { _handler: handler };
    });

    const db = getScopedDb("company_1");
    const handler = (db as unknown as { _handler: Function })._handler;

    const args = { where: { status: "PENDING" } };
    const queryFn = vi.fn().mockResolvedValue([]);

    await handler({ model: "Invoice", args, query: queryFn });

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          companyId: "company_1",
        }),
      })
    );
  });

  it("injects companyId in create for scoped models (not Company)", async () => {
    mockPrisma.$extends.mockImplementation((config) => {
      const handler = config.query.$allModels.create;
      return { _handler: handler };
    });

    const db = getScopedDb("company_1");
    const handler = (db as unknown as { _handler: Function })._handler;

    const args = { data: { name: "Test" } };
    const queryFn = vi.fn().mockResolvedValue({});

    await handler({ model: "Invoice", args, query: queryFn });

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Test",
          companyId: "company_1",
        }),
      })
    );
  });

  it("does NOT inject companyId in create for Company model", async () => {
    mockPrisma.$extends.mockImplementation((config) => {
      const handler = config.query.$allModels.create;
      return { _handler: handler };
    });

    const db = getScopedDb("company_1");
    const handler = (db as unknown as { _handler: Function })._handler;

    const args = { data: { name: "New Company" } };
    const queryFn = vi.fn().mockResolvedValue({});

    await handler({ model: "Company", args, query: queryFn });

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ companyId: "company_1" }),
      })
    );
  });

  it("skips non-scoped models", async () => {
    mockPrisma.$extends.mockImplementation((config) => {
      const handler = config.query.$allModels.findMany;
      return { _handler: handler };
    });

    const db = getScopedDb("company_1");
    const handler = (db as unknown as { _handler: Function })._handler;

    const args = { where: { status: "ACTIVE" } };
    const queryFn = vi.fn().mockResolvedValue([]);

    // InvoiceLine is not in SCOPED_MODELS
    await handler({ model: "InvoiceLine", args, query: queryFn });

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ companyId: "company_1" }),
      })
    );
  });
});

describe("getGroupDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$extends.mockImplementation((config) => {
      return { _extensionConfig: config };
    });
  });

  it("creates a prisma extension with query overrides", () => {
    const db = getGroupDb(["company_1", "company_2"]);
    expect(mockPrisma.$extends).toHaveBeenCalledTimes(1);
  });

  it("injects companyId IN filter for findMany", async () => {
    mockPrisma.$extends.mockImplementation((config) => {
      const handler = config.query.$allModels.findMany;
      return { _handler: handler };
    });

    const db = getGroupDb(["company_1", "company_2"]);
    const handler = (db as unknown as { _handler: Function })._handler;

    const args = { where: { status: "PENDING" } };
    const queryFn = vi.fn().mockResolvedValue([]);

    await handler({ model: "Invoice", args, query: queryFn });

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          companyId: { in: ["company_1", "company_2"] },
        }),
      })
    );
  });

  it("blocks writes in consolidated mode", async () => {
    mockPrisma.$extends.mockImplementation((config) => {
      return { _handlers: config.query.$allModels };
    });

    const db = getGroupDb(["company_1", "company_2"]);
    const handlers = (db as unknown as { _handlers: Record<string, Function> })._handlers;

    await expect(handlers.create()).rejects.toThrow("Writes not allowed");
    await expect(handlers.update()).rejects.toThrow("Writes not allowed");
    await expect(handlers.delete()).rejects.toThrow("Writes not allowed");
    await expect(handlers.createMany()).rejects.toThrow("Writes not allowed");
    await expect(handlers.updateMany()).rejects.toThrow("Writes not allowed");
    await expect(handlers.deleteMany()).rejects.toThrow("Writes not allowed");
  });
});
