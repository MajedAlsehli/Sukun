/**
 * The "simulate missing backend responses only where necessary" half of
 * Demo Mode. A future screen's real data call wraps itself in this instead
 * of hand-rolling a try/catch: the real endpoint is always attempted first
 * (so a screen wired to a real, reachable module still shows real data even
 * in Demo Mode) and only falls back to fixture data on failure — network
 * error, unbuilt endpoint (404), or unreachable DB, all of which currently
 * happen for the same reason (project-memory/07_Frontend_Status.md §6).
 * Outside Demo Mode this is a plain passthrough — a real error still throws.
 */
import { DEMO_MODE } from "./config";

export async function withDemoFallback<T>(realCall: () => Promise<T>, demoData: T | (() => T)): Promise<T> {
  if (!DEMO_MODE) return realCall();
  try {
    return await realCall();
  } catch {
    return typeof demoData === "function" ? (demoData as () => T)() : demoData;
  }
}
