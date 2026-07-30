# Sukun Frontend

Arabic-first Next.js frontend for the Sukun residential platform.

## Requirements

- Node.js 20 or newer
- A running Sukun Backend instance for real mode

## Setup

```bash
cp .env.example .env.local
npm ci
npm run dev
```

The development server runs on `http://localhost:3001`.

## Environment

- `NEXT_PUBLIC_DEMO_MODE=true` enables the built-in presentation fixtures.
- `NEXT_PUBLIC_DEMO_MODE=false` uses only the configured backend.
- `NEXT_PUBLIC_API_URL` is the backend origin; the client normalizes the `/api` suffix.

Never place secrets in a `NEXT_PUBLIC_*` variable because those values are compiled into the browser bundle.

## Commands

```bash
npm run dev
npm test
npm run build
npm start
```

## Architecture

Backend DTOs are defined in `src/lib/backend`, transformed by adapters in `src/lib/adapters`, loaded through hooks in `src/lib/hooks`, and rendered by the screen components. Demo fixtures remain isolated under `src/lib/demo` and never silently replace failed real requests.

