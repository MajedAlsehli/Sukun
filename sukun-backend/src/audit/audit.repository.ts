import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';

export const auditRepository = {
  async findMany(where: Prisma.AuditLogWhereInput, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  },
};
