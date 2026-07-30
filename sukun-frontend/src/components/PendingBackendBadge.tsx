/**
 * Was the standard dev-facing "Pending Backend Integration" indicator.
 * Retired by explicit user instruction (2026-07-27): this is a developer
 * placeholder and must never appear to end users. Renders nothing — call
 * sites across ~14 screens are left in place (a dev-only, no-op signal) so
 * removing every individual usage isn't required to satisfy "never shows
 * to end users"; no visual/behavioral change to any other part of a screen.
 */
export function PendingBackendBadge(_props: { note?: string }) {
  return null;
}
