import { prisma } from '../config/prisma';

export const fileRepository = {
  create(input: { storageKey: string; url: string; hash: string; mimeType: string; size: number }) {
    return prisma.file.create({ data: input });
  },

  findById(id: string) {
    return prisma.file.findUnique({ where: { id } });
  },

  findManyByIds(ids: string[]) {
    return prisma.file.findMany({ where: { id: { in: ids } } });
  },
};
