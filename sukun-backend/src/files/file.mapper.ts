import { File } from '@prisma/client';

export interface FileDto {
  id: string;
  url: string;
  hash: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export function toFileDto(entity: File): FileDto {
  return {
    id: entity.id,
    url: entity.url,
    hash: entity.hash,
    mimeType: entity.mimeType,
    size: entity.size,
    createdAt: entity.createdAt,
  };
}
