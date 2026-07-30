import { AuditLog, User } from '@prisma/client';

export interface ActivityEntryDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  description: string;
  timestamp: Date;
}

// Task 4: RE1/RE3 activity feeds must come from real audit data, never
// fabricated rows. This maps a raw AuditLog action code to an honest Arabic
// description - one line per action this task actually writes; an
// unrecognized/future action code falls back to the action code itself
// rather than silently hiding the event.
const ACTION_DESCRIPTIONS_AR: Record<string, string> = {
  PROJECT_CREATED: 'تم إنشاء المشروع',
  PROJECT_UPDATED: 'تم تحديث بيانات المشروع',
  PROJECT_PUBLISHED: 'تم نشر المشروع',
  PROJECT_DEACTIVATED: 'تم تعطيل المشروع مؤقتاً',
  PROJECT_REACTIVATED: 'تمت إعادة تفعيل المشروع',
  PROJECT_ARCHIVED: 'تمت أرشفة المشروع',
  PROJECT_MANAGER_ASSIGNED: 'تم تعيين مدير المشروع',
  PROJECT_MANAGER_REASSIGNED: 'تم تغيير مدير المشروع',
  PRIMARY_CONTRACTOR_ASSIGNED: 'تم تعيين المقاول الرئيسي',
  PRIMARY_CONTRACTOR_REASSIGNED: 'تم تغيير المقاول الرئيسي',
  BUILDING_CREATED: 'تمت إضافة مبنى جديد',
  BUILDING_UPDATED: 'تم تحديث بيانات المبنى',
  BUILDING_PUBLISHED: 'تم نشر المبنى',
  BUILDING_DEACTIVATED: 'تم تعطيل المبنى مؤقتاً',
  BUILDING_REACTIVATED: 'تمت إعادة تفعيل المبنى',
  BUILDING_ARCHIVED: 'تمت أرشفة المبنى',
};

type AuditLogWithUser = AuditLog & { user: User | null };

export function toActivityEntryDto(entry: AuditLogWithUser): ActivityEntryDto {
  return {
    id: entry.id,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    actorName: entry.user?.name ?? null,
    description: ACTION_DESCRIPTIONS_AR[entry.action] ?? entry.action,
    timestamp: entry.timestamp,
  };
}
