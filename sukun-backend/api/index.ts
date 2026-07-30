import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app';

// ---------------------------------------------------------------------------
// Task 10 - the Vercel serverless entry point.
//
// `src/server.ts` (which calls `app.listen`) stays exactly as it was and is
// still what `npm run dev` and `npm start` use. Vercel never runs it: on a
// serverless platform there is no long-lived port to listen on, only a
// request handler the platform invokes.
//
// The app is built ONCE per warm instance (module scope), not per request.
// Rebuilding it per invocation would re-register every router and, worse,
// construct a new Prisma client each time - which is precisely what exhausts
// the documented Supabase connection ceiling (config/prisma.ts).
//
// `vercel.json` rewrites every path here, so this single function serves
// /api/*, /health, /health/ready, /health/config and /docs exactly as the
// local server does. There is no second routing table to keep in sync.
// ---------------------------------------------------------------------------

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as never, res as never);
}
