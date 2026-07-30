import { ContractorOrganization } from '@prisma/client';

export interface ContractorOrganizationDto {
  id: string;
  name: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toContractorDto(entity: ContractorOrganization): ContractorOrganizationDto {
  return {
    id: entity.id,
    name: entity.name,
    phone: entity.phone,
    email: entity.email,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
