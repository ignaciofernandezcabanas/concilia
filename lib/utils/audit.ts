import { prisma } from "@/lib/db";

interface CreateAuditLogParams {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

/**
 * Create an audit log entry in the database.
 *
 * This is intentionally fire-and-forget safe: callers can await it for
 * guaranteed writes, or call without await when audit failures should
 * not block the main operation.
 */
export async function createAuditLog(
  params: CreateAuditLogParams
): Promise<void> {
  const { userId, action, entityType, entityId, details } = params;

  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      details: (details ?? undefined) as import("@prisma/client").Prisma.InputJsonValue | undefined,
    },
  });
}
