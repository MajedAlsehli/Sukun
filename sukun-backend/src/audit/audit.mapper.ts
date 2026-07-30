import { AuditLog } from '@prisma/client';

export interface AuditLogDto {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  timestamp: Date;
}

export function toAuditLogDto(entity: AuditLog): AuditLogDto {
  return {
    id: entity.id,
    userId: entity.userId,
    action: entity.action,
    entity: entity.entity,
    entityId: entity.entityId,
    ipAddress: entity.ipAddress,
    metadata: entity.metadata,
    timestamp: entity.timestamp,
  };
}
