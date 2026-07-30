import { z } from 'zod';
import { env } from '../config/env';

// Password policy (not pinned down by 09_Business_Rules.md beyond "enforced" -
// applying a reasonable default: min length + upper/lower/digit mix).
export const passwordSchema = z
  .string()
  .min(env.password.minLength, `Password must be at least ${env.password.minLength} characters`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(6, 'Invalid phone number'),
  password: passwordSchema,
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginDto = z.infer<typeof loginSchema>;

// The refresh token normally travels only in the httpOnly cookie the
// controller reads directly - the body field is a fallback for callers that
// can't use cookies (tests, non-browser clients), not the primary path.
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type LogoutDto = z.infer<typeof logoutSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'token is required'),
  password: passwordSchema,
});
export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token is required'),
  newPassword: passwordSchema,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
