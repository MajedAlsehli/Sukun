import { ProjectManager, User } from '@prisma/client';

export interface ManagerDto {
  id: string;
  name: string;
  email: string;
}

type ProjectManagerWithUser = ProjectManager & { user: User };

// Task 4 (decisions.md E3): deliberately minimal - a picker needs an id and a
// human-readable label, nothing else ("No private or unnecessary data").
export function toManagerDto(entity: ProjectManagerWithUser): ManagerDto {
  return {
    id: entity.id,
    name: entity.user.name,
    email: entity.user.email,
  };
}
