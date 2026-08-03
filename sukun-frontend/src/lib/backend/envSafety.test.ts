/**
 * Guards the "no Backend secret may enter a `NEXT_PUBLIC_*` variable" rule
 * structurally rather than by review.
 *
 * Every `NEXT_PUBLIC_*` value is inlined into the browser bundle at build time
 * and is readable by anyone who opens the site. This test enumerates every
 * environment variable the frontend source references and fails if a new one
 * appears that is not on the two-item allow list, or if any reference looks like
 * a credential.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs with the project root as cwd; `import.meta.url` is an http URL
// under the jsdom environment, so it cannot be used to locate the source tree.
const SRC = join(process.cwd(), "src");

/** The only two environment variables this frontend is allowed to read. */
const ALLOWED_ENV = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_DEMO_MODE",
  // Presentation-only kill switch for the frontend showcase catalogue
  // (`lib/demo/showcaseCatalogue.ts`). Carries no credential and changes no
  // request: it only decides whether fixture listings are merged into the
  // Backend's own catalogue for the demo. Set to "false" to serve server data
  // only. The point of this test is that a SECRET never gets a NEXT_PUBLIC_
  // name, and this one is a boolean feature flag.
  "NEXT_PUBLIC_SHOWCASE_CATALOGUE",
];

/** Substrings that would indicate a credential had been given a public name. */
const SECRET_MARKERS = [
  "SECRET",
  "PRIVATE_KEY",
  "SERVICE_KEY",
  "SERVICE_ROLE",
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_",
  "OPENAI",
  "SUPABASE",
  "API_KEY",
  "PASSWORD",
  "TOKEN",
  "CRON",
  "PARSE_API",
  "YOLO",
];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
      continue;
    }
    if (![".ts", ".tsx"].includes(extname(entry))) continue;
    if (entry.includes(".test.")) continue;
    acc.push(full);
  }
  return acc;
}

const files = sourceFiles(SRC);

function envReferences(): Array<{ file: string; name: string }> {
  const hits: Array<{ file: string; name: string }> = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
      hits.push({ file: file.slice(SRC.length + 1), name: match[1] });
    }
    for (const match of text.matchAll(/process\.env\[["'`]([A-Za-z0-9_]+)["'`]\]/g)) {
      hits.push({ file: file.slice(SRC.length + 1), name: match[1] });
    }
  }
  return hits;
}

describe("environment variable safety", () => {
  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("references only the allowed public variables", () => {
    const unexpected = envReferences().filter((h) => !ALLOWED_ENV.includes(h.name));
    expect(
      unexpected.map((h) => `${h.name} (${h.file})`),
      `frontend code may only read ${ALLOWED_ENV.join(", ")}`,
    ).toEqual([]);
  });

  it("references no variable whose name suggests a credential", () => {
    const suspicious = envReferences().filter((h) =>
      SECRET_MARKERS.some((marker) => h.name.toUpperCase().includes(marker)),
    );
    expect(suspicious.map((h) => `${h.name} (${h.file})`)).toEqual([]);
  });

  it("hard-codes no credential-shaped literal in the source tree", () => {
    // Mirrors the Backend's own §9.3 production check: the shipped bundle is
    // scanned for `sk-`, `postgres://`, `service_role` and JWT prefixes.
    const patterns: Array<[string, RegExp]> = [
      ["OpenAI key", /\bsk-[A-Za-z0-9]{20,}/],
      ["Postgres URL", /\bpostgres(ql)?:\/\/[^\s"'`]+/],
      ["Supabase service role", /service_role/],
      ["JWT literal", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const [label, pattern] of patterns) {
        if (pattern.test(text)) offenders.push(`${label} in ${file.slice(SRC.length)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("logs nothing from the API client — no console call in the transport layer", () => {
    for (const name of ["backend/client.ts", "backend/auth.ts", "backend/session.ts"]) {
      const text = readFileSync(join(SRC, "lib", name), "utf8");
      expect(text, `${name} must not log`).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
});
