import { Prisma, ProjectManagerStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

// No registration flow is documented anywhere in the 16 docs for Project
// Manager (unlike Technician, which has Flow 11) - same gap already flagged
// for Company accounts. Provisioning a row here is a manual DB operation for
// now; this repository supports resolving a PM's own project (Task 009) plus
// Task 4's read-only picker over the unassigned pool (decisions.md E3).
export const projectManagerRepository = {
  findByUserId(userId: string) {
    return prisma.projectManager.findUnique({ where: { userId } });
  },

  findById(id: string) {
    return prisma.projectManager.findUnique({ where: { id }, include: { user: true } });
  },

  findByProjectId(projectId: string) {
    return prisma.projectManager.findUnique({ where: { projectId } });
  },

  // Task 5 (RE5 profile "manager" field) - same lookup, with the user
  // relation included for display.
  findByProjectIdWithUser(projectId: string) {
    return prisma.projectManager.findUnique({ where: { projectId }, include: { user: true } });
  },

  // Unassigned pool: activated (usable) accounts with no current project,
  // scoped to the requesting company via the underlying User.companyId (the
  // same nullable scoping field COMPANY-role accounts already use).
  async findUnassigned(companyId: string, q: string | undefined, page: number, pageSize: number) {
    const where: Prisma.ProjectManagerWhereInput = {
      projectId: null,
      status: ProjectManagerStatus.ACTIVATED,
      user: {
        companyId,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
    };

    const [items, total] = await Promise.all([
      prisma.projectManager.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.projectManager.count({ where }),
    ]);

    return { items, total };
  },
};
