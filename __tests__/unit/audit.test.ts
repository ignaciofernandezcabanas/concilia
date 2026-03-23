import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  auditLog: { create: vi.fn() },
};

import { createAuditLog } from "@/lib/utils/audit";

describe("Audit Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.auditLog.create.mockResolvedValue({});
  });

  it("crea registro con todos los campos", async () => {
    await createAuditLog(mockDb as any, {
      userId: "user_1",
      action: "CREATE_INVOICE",
      entityType: "invoice",
      entityId: "inv_123",
    });

    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        action: "CREATE_INVOICE",
        entityType: "invoice",
        entityId: "inv_123",
      }),
    });
  });

  it("details es JSON arbitrario", async () => {
    await createAuditLog(mockDb as any, {
      userId: "user_1",
      action: "RESOLVE",
      entityType: "reconciliation",
      entityId: "reco_1",
      details: { oldStatus: "PROPOSED", newStatus: "APPROVED", confidence: 0.95 },
    });

    const call = mockDb.auditLog.create.mock.calls[0][0];
    expect(call.data.details).toEqual({
      oldStatus: "PROPOSED",
      newStatus: "APPROVED",
      confidence: 0.95,
    });
  });

  it("sin details → no falla", async () => {
    await createAuditLog(mockDb as any, {
      userId: "user_1",
      action: "DELETE",
      entityType: "transaction",
      entityId: "tx_1",
    });
    expect(mockDb.auditLog.create).toHaveBeenCalled();
  });
});
