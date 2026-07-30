import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Task 10 - serverless Prisma lifecycle.
//
// On Vercel every function instance is a separate Node process that may be
// re-invoked many times, and in development `ts-node-dev` re-evaluates modules
// on every reload. A plain `new PrismaClient()` at module scope therefore
// leaks a NEW connection pool per reload / per re-import - and this project
// runs against a Supabase pooler capped at 15 session-mode clients (see
// implementation-progress.md's Task 9 notes, where six signed-in browser tabs
// genuinely exhausted it).
//
// Caching the client on `globalThis` is Prisma's own documented remedy: one
// client per process, reused by every invocation that process serves.
//
// This is a lifecycle fix, not a scaling one. The connection ceiling is real
// and is documented rather than papered over - in production `DATABASE_URL`
// should point at the TRANSACTION pooler (port 6543, `?pgbouncer=true`), which
// is what lets a serverless deployment survive concurrency at all, while
// `DIRECT_URL` (port 5432) is used only by `prisma migrate deploy`.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as { saknPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.saknPrisma ??
  new PrismaClient({
    // Prisma's default stdout logging can echo query text on warnings. Errors
    // only: the request logger and error middleware already carry the context,
    // and a database message must never reach a client regardless
    // (shared/error.middleware.ts).
    log: ['error'],
  });

globalForPrisma.saknPrisma = prisma;
