/**
 * Test setup. Three jobs:
 *
 *  1. Install a deterministic in-memory `Storage` on `window`/`globalThis`.
 *     Node 25 ships its own experimental `localStorage` global, which shadows
 *     jsdom's and is inert without `--localstorage-file`; pinning our own
 *     implementation makes the storage assertions independent of the Node
 *     version the suite happens to run on.
 *  2. Give every test a clean slate — no storage carried between tests, no
 *     in-memory access token, no leftover `fetch` stub.
 *  3. Default the environment to **real mode** (`NEXT_PUBLIC_DEMO_MODE` unset),
 *     so a test that wants Demo Mode has to say so explicitly. That way the
 *     "real mode never falls back to fixtures" guarantees are the default the
 *     suite proves, not the exception.
 */
import { afterEach, beforeEach, vi } from "vitest";
import { __resetSessionStoreForTests } from "@/lib/backend/session";

/**
 * Keys are stored as own enumerable properties, exactly as the DOM `Storage`
 * interface exposes them — so `{ ...window.localStorage }` dumps the contents,
 * which is how the "no token was persisted" assertions read it.
 */
class MemoryStorage {
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, key)
      ? ((this as unknown as Record<string, string>)[key] ?? null)
      : null;
  }
  setItem(key: string, value: string): void {
    (this as unknown as Record<string, string>)[key] = String(value);
  }
  removeItem(key: string): void {
    delete (this as unknown as Record<string, string>)[key];
  }
  clear(): void {
    for (const key of Object.keys(this)) delete (this as unknown as Record<string, string>)[key];
  }
  key(index: number): string | null {
    return Object.keys(this)[index] ?? null;
  }
  get length(): number {
    return Object.keys(this).length;
  }
}

function installStorage(name: "localStorage" | "sessionStorage") {
  const store = new MemoryStorage();
  for (const target of [globalThis, window] as unknown as Array<Record<string, unknown>>) {
    Object.defineProperty(target, name, {
      value: store,
      configurable: true,
      writable: true,
    });
  }
  return store;
}

let local = installStorage("localStorage");
let session = installStorage("sessionStorage");

beforeEach(() => {
  local = installStorage("localStorage");
  session = installStorage("sessionStorage");
  local.clear();
  session.clear();
  __resetSessionStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  local.clear();
  session.clear();
  __resetSessionStoreForTests();
});
