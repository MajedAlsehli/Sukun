import { prisma } from '../config/prisma';

interface WriteAuditLogInput {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

// AUD-005/AUD-010: audit logs are immutable and append-only - insert only, never update/delete.
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata as never,
    },
  });
}
