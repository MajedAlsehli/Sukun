import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../shared/roles';
import { AccessTokenPayload } from '../shared/auth.middleware';

export function signAccessToken(userId: string, role: UserRole, companyId: string | null): string {
  const payload: AccessTokenPayload = { sub: userId, role, companyId };
  const options: jwt.SignOptions = { expiresIn: env.jwt.accessTtl as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.accessSecret, options);
}

// Refresh/reset tokens are opaque random strings, not JWTs: only their SHA-256
// hash is persisted, so a DB read alone never yields a usable token
// (defense in depth for SEC-003/SEC-006).
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = hashOpaqueToken(raw);
  return { raw, hash };
}

export function hashOpaqueToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function ttlToDate(ttl: string): Date {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttl}`);
  }
  const amount = parseInt(match[1], 10);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + amount * unitMs[match[2]]);
}
