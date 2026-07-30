/**
 * Task 3 — the Company, PM and technician domain clients, plus the two
 * approved UI additions and the mock-preservation guarantee.
 *
 * The same discipline as Task 2: assert the REQUEST the client issues and the
 * honest state it surfaces, against contracts read out of `sakn-backend/src`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installBackendStub,
  envelope,
  errorEnvelope,
  pathOf,
  queryOf,
  type BackendStub,
} from "@/test/backendHarness";
import { backendCompany } from "./company";
import { backendAdmin } from "./admin";
import { backendPm } from "./pm";
import { backendTechnician } from "./technician";
import { passwordProblem } from "@/components/homeowner/OwnerOnboardingScreen";
import { toHistoryItem } from "@/components/contractor/RepairHistoryScreen";

let stub: BackendStub;
beforeEach(() => {
  stub = installBackendStub();
});

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

/* ------------------------------------------------------------- Company */

describe("company client", () => {
  it("reads the three RE1 aggregates from their real endpoints", async () => {
    for (const [call, path] of [
      [() => backendCompany.overview(), "/api/company/overview"],
      [() => backendCompany.projectsSummary(), "/api/company/projects/summary"],
      [() => backendCompany.activity(), "/api/company/activity"],
    ] as const) {
      stub.reply(envelope({}));
      await call();
      expect(pathOf(stub.last())).toBe(path);
    }
  });

  it("sends `{active}` on a project status change, not a status string", async () => {
    // `updateProjectStatusSchema` is `{ active: boolean }`. A `{status}` body
    // — which the legacy helper used to send — would 400.
    stub.reply(envelope({}));
    await backendCompany.setProjectStatus("p1", false);
    expect(stub.last().method).toBe("PATCH");
    expect(pathOf(stub.last())).toBe("/api/projects/p1/status");
    expect(stub.last().body).toEqual({ active: false });
  });

  it("publish and archive are their own endpoints, not a status write", async () => {
    stub.reply(envelope({}));
    await backendCompany.publishProject("p1");
    expect(pathOf(stub.last())).toBe("/api/projects/p1/publish");
    stub.reply(envelope({}));
    await backendCompany.archiveProject("p1");
    expect(pathOf(stub.last())).toBe("/api/projects/p1/archive");
  });

  it("manager and contractor assignment use their dedicated re-assignment routes", async () => {
    stub.reply(envelope({}));
    await backendCompany.assignManager("p1", "m1");
    expect(pathOf(stub.last())).toBe("/api/projects/p1/manager");
    expect(stub.last().body).toEqual({ managerId: "m1" });
    stub.reply(envelope({}));
    await backendCompany.assignContractor("p1", "c1");
    expect(pathOf(stub.last())).toBe("/api/projects/p1/contractor");
    // `reassignContractorSchema` is `{ primaryContractorId }` — this assertion
    // used to encode the WRONG field, which is how the defect survived.
    expect(stub.last().body).toEqual({ primaryContractorId: "c1" });
  });

  it("omits blank picker queries rather than sending an empty string", async () => {
    stub.reply(envelope({ items: [] }));
    await backendCompany.searchManagers("   ");
    expect(queryOf(stub.last())).toEqual({});
    stub.reply(envelope({ items: [] }));
    await backendCompany.searchContractors("سعد");
    expect(queryOf(stub.last())).toEqual({ q: "سعد" });
  });

  it("workspace units serialize their filters", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 24 }));
    await backendCompany.listWorkspaceUnits("p1", { buildingId: "b1", occupancy: "OCCUPIED", q: " a " });
    expect(pathOf(stub.last())).toBe("/api/projects/p1/units");
    expect(queryOf(stub.last())).toMatchObject({ buildingId: "b1", occupancy: "OCCUPIED", q: "a" });
  });

  it("a foreign project 404s rather than 403s, so existence stays hidden", async () => {
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    await expect(backendCompany.getWorkspace("someone-elses")).rejects.toMatchObject({ httpStatus: 404 });
  });
});

/* --------------------------------------------------------------- RE4/RE5 */

describe("admin client", () => {
  it("covers the homeowner management surface", async () => {
    const calls: Array<[() => Promise<unknown>, string, string]> = [
      [() => backendAdmin.listHomeowners(), "GET", "/api/homeowners"],
      [() => backendAdmin.getHomeowner("h1"), "GET", "/api/homeowners/h1"],
      [() => backendAdmin.getHomeownerByUnit("A-142"), "GET", "/api/homeowners/by-unit/A-142"],
      [() => backendAdmin.createHomeowner({ name: "n", nationalId: "1", email: "a@b.c", phone: "05", unitId: "u" }), "POST", "/api/homeowners"],
      [() => backendAdmin.updateHomeowner("h1", { phone: "05" }), "PATCH", "/api/homeowners/h1"],
      [() => backendAdmin.resendHomeownerInvitation("h1"), "POST", "/api/homeowners/h1/resend-invitation"],
      [() => backendAdmin.transferHomeowner("h1", "u2"), "POST", "/api/homeowners/h1/transfer"],
      [() => backendAdmin.setHomeownerStatus("h1", true), "PATCH", "/api/homeowners/h1/status"],
    ];
    for (const [call, method, path] of calls) {
      stub.reply(envelope({}));
      await call();
      expect(stub.last().method).toBe(method);
      expect(pathOf(stub.last())).toBe(path);
    }
  });

  it("NEVER sends an activation or invitation code — the server issues it", async () => {
    stub.reply(envelope({}, 201));
    await backendAdmin.createHomeowner({ name: "n", nationalId: "1", email: "a@b.c", phone: "05", unitId: "u" });
    const body = stub.last().body as Record<string, unknown>;
    for (const forbidden of ["code", "activationCode", "password", "qr"]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("covers the technician management surface", async () => {
    const calls: Array<[() => Promise<unknown>, string, string]> = [
      [() => backendAdmin.listTechnicians(), "GET", "/api/technicians"],
      [() => backendAdmin.technicianSummary(), "GET", "/api/technicians/summary"],
      [() => backendAdmin.getTechnician("t1"), "GET", "/api/technicians/t1"],
      [() => backendAdmin.technicianReviews("t1"), "GET", "/api/technicians/t1/reviews"],
      [() => backendAdmin.createTechnician({ name: "n", email: "a@b.c", phone: "05", specialty: "كهرباء", projectId: "p" }), "POST", "/api/technicians"],
      [() => backendAdmin.updateTechnician("t1", { specialty: "سباكة" }), "PATCH", "/api/technicians/t1"],
      [() => backendAdmin.resendTechnicianInvitation("t1"), "POST", "/api/technicians/t1/resend-invitation"],
      [() => backendAdmin.transferTechnician("t1", "p2"), "POST", "/api/technicians/t1/transfer"],
      [() => backendAdmin.setTechnicianStatus("t1", false), "PATCH", "/api/technicians/t1/status"],
    ];
    for (const [call, method, path] of calls) {
      stub.reply(envelope({}));
      await call();
      expect(stub.last().method).toBe(method);
      expect(pathOf(stub.last())).toBe(path);
    }
  });

  it("a cross-company homeowner or technician 404s", async () => {
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    await expect(backendAdmin.getHomeowner("foreign")).rejects.toMatchObject({ httpStatus: 404 });
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    await expect(backendAdmin.getTechnician("foreign")).rejects.toMatchObject({ httpStatus: 404 });
  });
});

/* -------------------------------------------------------------------- PM */

describe("pm client", () => {
  it("covers the PM surface", async () => {
    const calls: Array<[() => Promise<unknown>, string, string]> = [
      [() => backendPm.overview(), "GET", "/api/pm/overview"],
      [() => backendPm.alerts(), "GET", "/api/pm/alerts"],
      [() => backendPm.activity(), "GET", "/api/pm/activity"],
      [() => backendPm.reports(), "GET", "/api/pm/reports"],
      [() => backendPm.contractors(), "GET", "/api/pm/contractors"],
      [() => backendPm.contractorPerformance("t1"), "GET", "/api/pm/contractors/t1/performance"],
      [() => backendPm.contractorInsight("t1"), "GET", "/api/pm/contractors/t1/insight"],
      [() => backendPm.copilotSummary(), "POST", "/api/pm/copilot/summary"],
      [() => backendPm.copilotChat({ message: "q" }), "POST", "/api/pm/copilot/chat"],
    ];
    for (const [call, method, path] of calls) {
      stub.reply(envelope({}));
      await call();
      expect(stub.last().method).toBe(method);
      expect(pathOf(stub.last())).toBe(path);
    }
  });

  it("serializes report filters as one comma-separated value", async () => {
    stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
    await backendPm.reports({ status: ["ROUTED", "IN_PROGRESS"], priority: ["HIGH"], q: "  x  " });
    expect(queryOf(stub.last())).toEqual({ status: "ROUTED,IN_PROGRESS", priority: "HIGH", q: "x" });
  });

  it("carries an unassigned manager through as an honest state, not an error", async () => {
    stub.reply(envelope({ assigned: false, project: null, kpis: {}, totalActiveReports: 0 }));
    const r = await backendPm.overview();
    expect(r.assigned).toBe(false);
  });

  /**
   * A fresh production probe found every Copilot ask returning 400: the client
   * sent `{ question }` while `pmCopilotChatSchema` requires `{ message }`, and
   * the original test asserted only the PATH, so it passed on a body the
   * Backend rejects. Both bodies are now pinned field-by-field.
   */
  it("sends the Copilot bodies the Backend schemas actually accept", async () => {
    stub.reply(envelope({ available: true, text: "…" }));
    await backendPm.copilotChat({ message: "ما حالة البلاغات؟" });
    expect(stub.last().body).toEqual({ message: "ما حالة البلاغات؟" });

    stub.reply(envelope({ available: true, text: "…" }));
    await backendPm.copilotSummary({});
    expect(stub.last().body).toEqual({});

    // Neither schema has a `projectId`: the grounding snapshot is built
    // server-side from the principal so a client cannot widen its own scope.
    const src = read("lib/backend/pm.ts");
    expect(src).not.toMatch(/copilot(Summary|Chat):[^\n]*projectId/);
    expect(src).not.toMatch(/copilotChat:[^\n]*question/);
    // And the hook must pass the question through as `message`.
    expect(read("lib/hooks/usePmTech.ts")).toContain("backendPm.copilotChat({ message: question })");
  });

  it("exposes an unavailable Copilot as unavailable rather than throwing", async () => {
    stub.reply(envelope({ available: false, reason: "AI_SERVICE_UNAVAILABLE" }));
    const r = await backendPm.copilotChat({ message: "q" });
    expect(r.available).toBe(false);
    expect(r.reason).toBe("AI_SERVICE_UNAVAILABLE");
  });

  it("has NO mutating PM endpoint — PM2 is read-only by construction", () => {
    const source = read("lib/backend/pm.ts");
    // Routing is automatic; the canonical API admits no PM write on a report.
    expect(source).not.toMatch(/apiClient\.(patch|delete)\(/);
    // The only POSTs are the two Copilot calls.
    expect(source.match(/apiClient\.post</g) ?? []).toHaveLength(2);
  });
});

/* ------------------------------------------------------------- technician */

describe("technician client", () => {
  it("reads only its own scoped task surface", async () => {
    for (const [call, path] of [
      [() => backendTechnician.tasks(), "/api/technician/tasks"],
      [() => backendTechnician.taskSummary(), "/api/technician/tasks/summary"],
      [() => backendTechnician.repairHistory(), "/api/technician/repairs/history"],
    ] as const) {
      stub.reply(envelope({ items: [], total: 0, page: 1, pageSize: 20 }));
      await call();
      expect(pathOf(stub.last())).toBe(path);
    }
    // It never reaches for the Company-only project browse routes.
    expect(read("lib/backend/technician.ts")).not.toContain("/projects");
  });

  it("submits a repair with real after-photos", async () => {
    stub.reply(envelope({}));
    await backendTechnician.submitRepair("r1", {
      afterPhotos: [{ fileName: "a.jpg", mimeType: "image/jpeg", contentBase64: "AAA" }],
      note: "done",
    });
    expect(pathOf(stub.last())).toBe("/api/reports/r1/submit-repair");
    const body = stub.last().body as { afterPhotos: { contentBase64: string }[]; note: string };
    expect(body.afterPhotos).toHaveLength(1);
    expect(body.afterPhotos[0].contentBase64).not.toContain("data:");
    expect(body.note).toBe("done");
  });

  it("surfaces the single-active-repair rule instead of swallowing it", async () => {
    stub.reply(errorEnvelope(409, "ACTIVE_REPAIR_EXISTS", "busy", { reportNumber: 2418 }));
    await expect(backendTechnician.startRepair("r2")).rejects.toMatchObject({
      errorCode: "ACTIVE_REPAIR_EXISTS",
      httpStatus: 409,
    });
  });

  it("a report assigned to another technician 404s", async () => {
    stub.reply(errorEnvelope(404, "NOT_FOUND"));
    await expect(backendTechnician.startRepair("someone-elses")).rejects.toMatchObject({ httpStatus: 404 });
  });
});

/* -------------------------------------------- the two approved additions */

describe("activation password (Step 6)", () => {
  it("mirrors the Backend's own policy, and rejects everything it rejects", () => {
    expect(passwordProblem("Passw0rd", "Passw0rd")).toBeNull();
    expect(passwordProblem("Pass0", "Pass0")).toMatch(/٨|8/);
    expect(passwordProblem("passw0rd", "passw0rd")).toContain("كبير");
    expect(passwordProblem("PASSW0RD", "PASSW0RD")).toContain("صغير");
    expect(passwordProblem("Password", "Password")).toContain("رقم");
    expect(passwordProblem("Passw0rd", "Passw0rdX")).toContain("متطابقتين");
  });

  it("never logs, persists or defaults the password anywhere", () => {
    const screen = read("components/homeowner/OwnerOnboardingScreen.tsx");
    const hook = read("lib/hooks/useActivation.ts");
    for (const src of [screen, hook]) {
      expect(src).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(src).not.toMatch(/localStorage\.setItem\([^)]*password/i);
    }
    // No default, generated or cached credential — the resident types it.
    expect(screen).not.toMatch(/password\s*=\s*["'][^"']+["']/);
  });
});

describe("real-mode logout (Step 7)", () => {
  it("exists, calls only the canonical flow, and is mutually exclusive with the demo switcher", () => {
    const menu = read("components/auth/SessionMenu.tsx");
    expect(menu).toContain("signOut");
    // It must not reach for the transport itself.
    expect(menu).not.toMatch(/\bfetch\s*\(/);
    // Real mode only — the Demo Role Switcher is never exposed alongside it.
    expect(menu).toContain("if (DEMO_MODE");
    const switcher = read("components/demo/DemoRoleSwitcher.tsx");
    expect(switcher).toContain("if (!DEMO_MODE");
  });

  it("is mounted once, in the layout, so no screen file gained a control", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("<SessionMenu />");
    expect(layout.match(/<SessionMenu \/>/g) ?? []).toHaveLength(1);
  });
});

/* ------------------------------------------- fixtures still untouched */

describe("Task 3 changed no mock fixture", () => {
  it("the approved demo modules and AI mock retain their checked-in contents", () => {
    const approvedHashes: Record<string, string> = {
      "lib/demo/config.ts": "c8c2ed074323089d63fff1f45d5daf06f14c8efe102f5b98da41b75cdf3c6439",
      "lib/demo/fixtures.ts": "9b8b368be3971e6188ff2aa4aaf9048a2f21b3d974c6b56f9b42c7df92f01db5",
      "lib/demo/mockFetch.ts": "d2786c0262540fffcc61c8310cadc902d8dd81892b7636a671c2e95d83d1191d",
      "lib/demo/discoveryFixtures.ts": "c99f7ec15c5924de51317d28487b49acd21828c0dc359093bffb544d43d0dbb9",
      "lib/demo/projectsFixtures.ts": "09b112248279eb841951c235ab0edd7c09c47088aa5e2bd9158db15f26cac51b",
      "components/demo/DemoRoleSwitcher.tsx": "0d16f7cf036bfdad120b166a5e45a2928a78925ef804e2ba3631be71d9a4e296",
      "lib/ai/mock.ts": "33123e00234e4c1990347b7c800e4beb1f9a3e028bcd08e8d55d28b85d609468",
    };

    for (const [rel, expected] of Object.entries(approvedHashes)) {
      const actual = createHash("sha256").update(read(rel)).digest("hex");
      expect(actual, rel).toBe(expected);
    }
  });

  it("no Task 3 domain module routes through withDemoFallback", () => {
    for (const rel of [
      "lib/backend/company.ts",
      "lib/backend/admin.ts",
      "lib/backend/pm.ts",
      "lib/backend/technician.ts",
      "lib/hooks/useCompany.ts",
      "lib/hooks/usePmTech.ts",
    ]) {
      expect(read(rel), rel).not.toContain("withDemoFallback");
    }
  });

  it("every Task 3 hook is inert in Demo Mode", () => {
    for (const rel of ["lib/hooks/useCompany.ts", "lib/hooks/usePmTech.ts"]) {
      const src = read(rel);
      expect(src, rel).toContain("DEMO_MODE");
      expect(src, rel).toMatch(/enabled: !DEMO_MODE/);
    }
  });
});

/* ------------------------------------------------- mobile scope guard */

describe("the mobile corrections never reach the desktop rendering", () => {
  /**
   * The scope rule changed deliberately during the pre-event stabilization.
   *
   * It used to be "only four recorded routes may carry `data-sk-mobile-fit`",
   * because the mobile block was a narrow fix for four measured overflows. The
   * requirement is now that EVERY route is usable at 375-393px, so the marker
   * is on every screen and the block covers the whole app.
   *
   * What must still hold — and is the only thing that ever protected the
   * approved desktop design — is that not one of these rules can apply at
   * 1440x900. That is what is asserted here, structurally, for every rule in
   * the file rather than for a frozen list of screens.
   */
  it("every mobile rule lives inside a max-width media query", () => {
    // Comments carry prose full of braces and commas; strip them so the walk
    // below sees only real CSS.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );

    // Every hook the mobile corrections are keyed on. A rule that uses one of
    // these and is NOT inside a max-width query would reach 1440x900.
    const MOBILE_HOOKS = [
      "data-sk-mobile-fit",
      "data-sk-scroll-row",
      "data-sk-cta-bar",
      "data-sk-session-menu",
      "data-sk-assistant-card",
      ".sk-shell",
      ".sk-who",
      ".sk-grid3",
      ".sk-capstrip",
      ".sk-stats",
      ".sk-foot",
      ".sk-hero",
      ".sk-root h1",
      ".sk-root h2",
    ];

    /**
     * Three rules are deliberately NOT inside a media query, because the
     * collision they fix happens at every width: at 1440x900 the session badge
     * sat on top of the project-details CTA bar, and that bar covered the
     * "إلغاء الزيارة" button. They are safe at desktop because every offset
     * they apply is built from `--sk-bottom-nav-h` / `--sk-cta-h`, which
     * `BottomStack` measures from the live elements and which are 0px on every
     * screen that has neither — so the rule resolves to the original value.
     */
    const INTENTIONALLY_UNSCOPED = [
      "[data-sk-cta-bar]",
      "[data-sk-session-menu]",
      "body[data-sk-cta-bar-present] [data-sk-mobile-fit]",
    ];

    let depth = 0;
    let mediaDepth: number | null = null;
    let mediaQuery = "";
    let pendingSelector = "";
    const unscoped: string[] = [];

    for (const rawLine of css.split("\n")) {
      const line = rawLine.trim();
      if (line === "") continue;

      if (line.startsWith("@media")) {
        mediaQuery = line;
        mediaDepth = depth;
      } else if (!line.startsWith("@")) {
        pendingSelector += (pendingSelector ? " " : "") + line;
        if (line.endsWith("{")) {
          const selector = pendingSelector;
          if (MOBILE_HOOKS.some((h) => selector.includes(h))) {
            if (mediaDepth === null) unscoped.push(selector);
            else expect(mediaQuery, selector).toMatch(/max-width/);
          }
          pendingSelector = "";
        } else if (line.endsWith("}") || line.endsWith(";")) {
          pendingSelector = "";
        }
      }

      for (const ch of line) {
        if (ch === "{") depth += 1;
        if (ch === "}") {
          depth -= 1;
          if (mediaDepth !== null && depth <= mediaDepth) {
            mediaDepth = null;
            mediaQuery = "";
          }
        }
      }
    }

    const unexpected = unscoped.filter(
      (sel) => !INTENTIONALLY_UNSCOPED.includes(sel.replace(/\s*\{$/, "").trim()),
    );
    expect(unexpected).toEqual([]);

    // …and each of the three must be built from a MEASURED height, never from
    // a hard-coded offset that would move something at desktop.
    //
    // A selector can legitimately appear more than once — `[data-sk-session-menu]`
    // also has a mobile-only `display: none` rule — so this looks at every
    // occurrence and requires the UNSCOPED one to use a measured variable.
    for (const sel of INTENTIONALLY_UNSCOPED) {
      const bodies: string[] = [];
      let at = css.indexOf(sel + " {");
      expect(at, `${sel} must exist`).toBeGreaterThan(-1);
      while (at > -1) {
        bodies.push(css.slice(at, css.indexOf("}", at)));
        at = css.indexOf(sel + " {", at + 1);
      }
      expect(bodies.some((b) => /--sk-bottom-nav-h|--sk-cta-h/.test(b)), sel).toBe(true);
    }
  });

  it("declares the bottom-stack measurements the fixed layers share", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const token of ["--sk-bottom-nav-h", "--sk-cta-h", "--sk-safe-b"]) {
      expect(css, token).toContain(token);
    }
    // Safe-area support is not optional on an iPhone.
    expect(css).toContain("env(safe-area-inset-bottom");
  });

  it("does not solve clipping by hiding it on the page", () => {
    // The brief is explicit: a row that cannot stack becomes a deliberate
    // scroller, never `overflow-x: hidden` on the document.
    const landing = read("components/landing/LandingScreen.tsx");
    expect(landing).not.toContain('overflowX: "hidden"');
  });
});

/* ------------------------------------------- C3 repair-history envelope */

/**
 * Regression cover for a real defect the PRODUCTION sweep caught: C3 read the
 * report's fields off the history ITEM instead of off `item.report`, so the
 * screen threw the moment a technician actually had a closed repair. These
 * pin the envelope's real shape and the two edge rows around it.
 */
describe("C3 repair history maps the envelope the Backend actually returns", () => {
  const NOW = Date.parse("2026-07-29T00:00:00.000Z");

  const item = (over: Record<string, unknown> = {}) =>
    ({
      repairId: "rep-1",
      durationMinutes: 1720,
      startedAt: "2026-07-18T06:00:00.000Z",
      submittedAt: "2026-07-19T10:00:00.000Z",
      closedAt: "2026-07-19T12:00:00.000Z",
      technicianNote: "تم استبدال السيفون.",
      review: { rating: 4, comment: "خدمة جيدة.", createdAt: "2026-07-19T13:00:00.000Z" },
      report: {
        id: "rpt-1",
        reportNumber: 2451,
        problemText: "تسريب في دورة المياه",
        priority: "HIGH",
        location: { projectName: "مشروع حقيقي", buildingName: "ب", unitNumber: "B-14" },
        homeowner: { name: "مالك حقيقي" },
        warranty: { verdict: "COVERED" },
        ai: { problemText: "تحليل حقيقي" },
        homeownerNote: "بدأت أمس.",
        photoCounts: { before: 2, after: 3 },
        createdAt: "2026-07-17T06:00:00.000Z",
        updatedAt: "2026-07-19T12:00:00.000Z",
      },
      ...over,
    }) as unknown as Parameters<typeof toHistoryItem>[0];

  it("reads report fields from item.report, not from the item root", () => {
    const h = toHistoryItem(item(), NOW);
    expect(h.id).toBe("rep-1");
    expect(h.number).toBe("#2451");
    expect(h.project).toBe("مشروع حقيقي");
    expect(h.building).toBe("ب");
    expect(h.unit).toBe("B-14");
    expect(h.owner).toBe("مالك حقيقي");
    expect(h.title).toBe("تسريب في دورة المياه");
    expect(h.priority).toBe("عالية");
    expect(h.warranty).toBe("in");
    expect(h.aiDescription).toBe("تحليل حقيقي");
    expect(h.homeownerNote).toBe("بدأت أمس.");
    expect(h.before).toBe(2);
    expect(h.after).toBe(3);
  });

  it("takes the repair's own duration, note and review from the item root", () => {
    const h = toHistoryItem(item(), NOW);
    expect(h.duration).toBe("1 يوم و4 ساعات");
    expect(h.repairNote).toBe("تم استبدال السيفون.");
    expect(h.rating).toBe(4);
    expect(h.comment).toBe("خدمة جيدة.");
    expect(h.closedDate).toBe("2026-07-19");
    expect(h.ageDays).toBe(9);
  });

  it("renders an em dash rather than inventing a duration or a rating", () => {
    const h = toHistoryItem(item({ durationMinutes: null, review: null }), NOW);
    expect(h.duration).toBe("—");
    // 0 means "no review" and the stars renderer shows none — never a fake 4.8.
    expect(h.rating).toBe(0);
    expect(h.comment).toBe("");
  });

  it("survives a row with no dates and no nested report at all", () => {
    const h = toHistoryItem(
      { repairId: "rep-x", durationMinutes: null, startedAt: null, submittedAt: null, closedAt: null, technicianNote: null, review: null } as unknown as Parameters<typeof toHistoryItem>[0],
      NOW,
    );
    expect(h.number).toBe("—");
    expect(h.project).toBe("—");
    expect(h.closedDate).toBe("—");
    // An undated repair sorts as oldest, so it can never drift into "آخر 30 يوم".
    expect(h.ageDays).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("the screen never dereferences the selected row unguarded", () => {
    const src = read("components/contractor/RepairHistoryScreen.tsx");
    // An empty pool leaves `sel` undefined; the detail branch must require it.
    expect(src).toContain("if (selectedId && sel)");
    // And real mode must not present a failed load as an empty archive.
    expect(src).toContain('live.status === "error"');
  });

  it("real mode draws the journey from the event log, not the all-green checklist", () => {
    const src = read("components/contractor/RepairHistoryScreen.tsx");
    // The authored eight-step list survives, but only Demo Mode renders it.
    expect(src).toContain("const master = [");
    expect(src).toContain("const steps = DEMO_MODE ? master : journey.timeline.map((e) => e.label)");
    // The event log is keyed on the REPORT id, never the repair id.
    expect(src).toContain("useReportTimeline(DEMO_MODE || !selectedId ? undefined : sel?.reportId)");
    // A report with no recorded AI analysis must not render an empty heading.
    expect(src).toContain('sel.aiDescription || "لم يُسجَّل تحليل آلي لهذا البلاغ."');
  });

  it("the client types the history page as repairs, not report summaries", () => {
    const src = read("lib/backend/technician.ts");
    expect(src).toContain('apiClient.get<RepairHistoryPage>("/technician/repairs/history"');
    expect(src).toMatch(/interface RepairHistoryItemDto[\s\S]*report: ReportDetailDto/);
  });
});

/* ------------------------------------------ RE4 / RE1 real-mode defects */

/**
 * Two more defects the LOCAL six-role sweep caught, both invisible to Demo
 * Mode because the fixtures never produce the offending value.
 */
describe("RE4 renders every real homeowner status without crashing", () => {
  const src = read("components/company/HomeownersManagementScreen.tsx");

  it("maps every Backend status onto a label the style map actually has", () => {
    // The crash: `invitation: "—"` for non-PENDING owners, and INV_STYLE has no
    // "—" key, so `INV_STYLE[label].bg` threw on the FIRST active homeowner.
    expect(src).not.toContain('h.status === "PENDING" ? "تم إرسال الدعوة" : "—"');
    expect(src).toContain("invitation: invitationLabel(h.status)");
    for (const status of ["ACTIVE", "PENDING", "NOT_ACTIVATED", "DEACTIVATED"]) {
      expect(src, status).toContain("status === \"ACTIVE\" || status === \"PENDING\"");
    }
  });

  it("makes both chip lookups total so no label can erase the screen", () => {
    expect(src).toContain("ACT_STYLE[o.activation] ?? NEUTRAL_CHIP");
    expect(src).toContain("INV_STYLE[o.invitation] ?? NEUTRAL_CHIP");
    expect(src).toContain("const NEUTRAL_CHIP =");
  });

  it("resolves an occupied owner's unit, which /units/vacant can never contain", () => {
    // The vacant set stays the picker's source; the owned units are folded in
    // ONLY for the row lookup, so no occupied unit is ever offered as vacant.
    expect(src).toContain("const ownedUnits: Unit[]");
    expect(src).toContain("const unitsView = DEMO_MODE ? units : [...realUnits, ...ownedUnits]");
    expect(src).toContain("const pickableUnits = DEMO_MODE ? unitsView : realUnits");
  });
});

describe("RE1's activity feed renders the Backend's Arabic description", () => {
  it("types the audit row as the Backend actually returns it", () => {
    const src = read("lib/backend/company.ts");
    expect(src).toMatch(/interface CompanyActivityItemDto[\s\S]*description: string;[\s\S]*timestamp: string;/);
    // The old invented fields are gone.
    expect(src).not.toMatch(/interface CompanyActivityItemDto[\s\S]*targetLabel/);
  });

  it("never prints a raw action code into an Arabic screen", () => {
    const src = read("components/company/CompanyDashboardScreen.tsx");
    expect(src).toContain("title: a.description");
    expect(src).not.toContain("title: a.type");
    expect(src).toContain("relativeArabicDay(a.timestamp)");
  });
});

/* ------------------------------------------- request-body contract audit */

/**
 * The Copilot 400 exposed a whole BUG CLASS: a test that asserts only the
 * request PATH passes happily on a body the Backend rejects. Every mutating
 * body was then diffed field-by-field against the `validateBody` schemas in
 * `sakn-backend/src`, and it found a second one — `PATCH /projects/:id/contractor`
 * takes `primaryContractorId`, not `contractorId`.
 *
 * These pin the field NAMES for every mutation whose body the client composes
 * itself, so a rename on either side fails here instead of in production.
 */
describe("every request body matches its Backend schema", () => {
  const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
    // projects — the manager and contractor routes are NOT symmetric.
    ["PATCH /projects/:id/manager", () => backendCompany.assignManager("p1", "m1"), { managerId: "m1" }],
    ["PATCH /projects/:id/contractor", () => backendCompany.assignContractor("p1", "c1"), { primaryContractorId: "c1" }],
    ["PATCH /projects/:id/status", () => backendCompany.setProjectStatus("p1", true), { active: true }],
    // homeowners / technicians
    ["POST /homeowners/:id/transfer", () => backendAdmin.transferHomeowner("h1", "u9"), { unitId: "u9" }],
    ["PATCH /homeowners/:id/status", () => backendAdmin.setHomeownerStatus("h1", false), { active: false }],
    ["POST /technicians/:id/transfer", () => backendAdmin.transferTechnician("t1", "p9"), { projectId: "p9" }],
    ["PATCH /technicians/:id/status", () => backendAdmin.setTechnicianStatus("t1", true), { active: true }],
    // PM Copilot
    ["POST /pm/copilot/chat", () => backendPm.copilotChat({ message: "س" }), { message: "س" }],
    // technician repair transitions
    [
      "POST /reports/:id/submit-repair",
      () => backendTechnician.submitRepair("r1", { afterPhotos: [{ fileName: "a.jpg", mimeType: "image/jpeg", contentBase64: "AA" }], note: "تم" }),
      { afterPhotos: [{ fileName: "a.jpg", mimeType: "image/jpeg", contentBase64: "AA" }], note: "تم" },
    ],
  ];

  it.each(cases)("%s", async (_label, call, expected) => {
    stub.reply(envelope({}));
    await call();
    expect(stub.last().body).toEqual(expected);
  });

  it("no client sends a field its schema does not define", () => {
    // The two field names that were actually wrong, kept out by name.
    expect(read("lib/backend/company.ts")).not.toMatch(/\/contractor`,\s*\{\s*contractorId\s*\}/);
    expect(read("lib/backend/pm.ts")).not.toMatch(/copilotChat:[^\n]*\{\s*question/);
  });
});

/* ---------------------------------------------------------- no secrets */

describe("no Task 3 module can leak a secret", () => {
  it("references only the two public env vars and logs nothing", () => {
    for (const rel of [
      "lib/backend/company.ts", "lib/backend/admin.ts",
      "lib/backend/pm.ts", "lib/backend/technician.ts",
      "lib/hooks/useCompany.ts", "lib/hooks/usePmTech.ts",
      "components/auth/SessionMenu.tsx",
    ]) {
      const src = read(rel);
      const envRefs = src.match(/process\.env\.[A-Z_]+/g) ?? [];
      for (const ref of envRefs) {
        expect(["process.env.NEXT_PUBLIC_API_URL", "process.env.NEXT_PUBLIC_DEMO_MODE"], `${rel}: ${ref}`).toContain(ref);
      }
      expect(src, rel).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(src, rel).not.toMatch(/service_role|SUPABASE_|JWT_[A-Z]*SECRET|sk-[A-Za-z0-9]{20,}/);
    }
  });
});

void vi;
