import { auditRepository } from './audit.repository';
import { toAuditLogDto } from './audit.mapper';
import { ListAuditLogsQueryDto } from './audit.dto';

// GET /api/audit - "Company Only... Returns Audit Logs". The docs don't
// specify any further scoping (e.g. to the Company's own users/projects) -
// Company is "the highest operational authority inside MVP"
// (04_User_Roles.md), so this returns system-wide logs, optionally filtered
// by the query params, rather than inventing an unspecified per-company scope.
export const auditService = {
  async list(query: ListAuditLogsQueryDto) {
    const where = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const { items, total } = await auditRepository.findMany(where, query.page, query.pageSize);

    return {
      items: items.map(toAuditLogDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  },
};
