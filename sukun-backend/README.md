# Sukun Backend

TypeScript API for the Sukun residential platform. It provides authentication, role-based access, projects, units, homeowners, technicians, visits, warranties, reports, repair workflows, AI integrations, and operational dashboards.

## Stack

- Express and TypeScript
- Prisma and PostgreSQL
- JWT access tokens with rotating refresh cookies
- OpenAI and optional external defect detection
- Optional Supabase Storage for public and private media

## Setup

```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

The API runs on `http://localhost:4000`; application routes are mounted below `/api`.

## Commands

```bash
npm run dev
npm test
npm run build
npm run prisma:generate
npm run demo:seed
```

## Database migrations

The complete migration history lives in `prisma/migrations`. Never rename or edit migrations that have already been applied. Production deployments should run `prisma migrate deploy` with a direct database connection.

## Security

- Keep `.env`, database credentials, JWT secrets, provider keys, and Supabase service keys outside Git.
- Configure `FRONTEND_URL` and `FRONTEND_URLS` as exact trusted origins.
- Use separate, random JWT access and refresh secrets of at least 32 characters.
- Private media belongs in the private storage bucket and is served only through authorized signed URLs.

## Deployment

`vercel.json` contains the Vercel serverless entry point and routing configuration. Configure production variables from `.env.example`, apply pending migrations, and verify `/health` and `/health/ready` after deployment.

