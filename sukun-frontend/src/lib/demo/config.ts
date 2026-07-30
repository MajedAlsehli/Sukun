/**
 * Single configuration flag for Demo Mode (user instruction, 2026-07-27):
 * lets every production journey/screen be entered and demoed without a
 * reachable backend, without touching the real auth/backend implementation.
 * Disable by setting `NEXT_PUBLIC_DEMO_MODE=false` (or removing the line)
 * in `.env.local` — every demo-only code path (`DemoRoleSwitcher`,
 * `enterDemoRole`, `withDemoFallback`) goes dormant, nothing else changes.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
