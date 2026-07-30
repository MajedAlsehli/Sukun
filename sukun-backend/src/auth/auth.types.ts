import { User } from '@prisma/client';

export type UserEntity = User;

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserEntity['role'];
  status: UserEntity['status'];
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
