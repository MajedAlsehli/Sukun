import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';

// Task 4 (decisions.md E2): read-only lookup for RE2's primary-contractor
// picker. No create/update/delete here - management is out of this task's
// scope; fixtures/seeds populate rows directly.
export const contractorRepository = {
  findById(id: string) {
    return prisma.contractorOrganization.findUnique({ where: { id } });
  },

  async findMany(companyId: string, q: string | undefined, page: number, pageSize: number) {
    const where: Prisma.ContractorOrganizationWhereInput = {
      companyId,
      isActive: true,
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.contractorOrganization.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contractorOrganization.count({ where }),
    ]);

    return { items, total };
  },
};
