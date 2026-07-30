# Sukun

Sukun is an Arabic-first residential platform connecting property companies, project managers, technicians, homeowners, and home seekers in one system.

## Repository structure

- `sukun-frontend/` — Next.js 15 and React 19 frontend.
- `sukun-backend/` — Express, TypeScript, Prisma, and PostgreSQL API.

The two applications are intentionally independent. Each has its own dependencies, environment template, tests, and deployment configuration.

## Local development

### Backend

```bash
cd sukun-backend
cp .env.example .env
npm ci
npx prisma generate
npm run dev
```

### Frontend

```bash
cd sukun-frontend
cp .env.example .env.local
npm ci
npm run dev
```

By default, the frontend expects the API at `http://localhost:4000/api`. Update `NEXT_PUBLIC_API_URL` when using a deployed backend.

## Quality checks

Run these inside each application directory:

```bash
npm test
npm run build
```

## Security

Never commit `.env` files, database URLs, JWT secrets, provider keys, Vercel metadata, or uploaded private media. Only sanitized examples belong in this repository.

## Deployment

Both applications include their own `vercel.json`. Create separate Vercel projects, set their environment variables from the provided templates, and add the deployed frontend origin to the backend CORS allowlist.

