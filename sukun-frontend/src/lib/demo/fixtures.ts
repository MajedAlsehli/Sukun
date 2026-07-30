/**
 * Synthetic `PublicUser` fixtures for Demo Mode's role switcher. Values are
 * placeholder-obvious ("عرض تجريبي" / demo emails) on purpose — never
 * mistakable for a real account, matching the "Pending Backend Integration"
 * labeling convention (`components/PendingBackendBadge.tsx`) of never
 * silently passing off simulated state as real.
 */
import type { PublicUser, UserRole } from "@/lib/api";

const DEMO_NAMES: Record<UserRole, string> = {
  HOME_SEEKER: "باحث عن منزل (عرض تجريبي)",
  HOMEOWNER: "مالك وحدة (عرض تجريبي)",
  TECHNICIAN: "فني صيانة (عرض تجريبي)",
  PROJECT_MANAGER: "مدير مشروع (عرض تجريبي)",
  COMPANY: "شركة عقارية (عرض تجريبي)",
};

export function demoUserFor(role: UserRole): PublicUser {
  return {
    id: `demo-${role.toLowerCase()}`,
    name: DEMO_NAMES[role],
    email: `demo.${role.toLowerCase()}@sakn.demo`,
    phone: "0500000000",
    role,
    status: "active",
  };
}
