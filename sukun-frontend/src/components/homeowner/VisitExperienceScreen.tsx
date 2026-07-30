"use client";

/**
 * H5 · تجربة الزيارة (Visit Experience) — presentation rebuilt 2026-07-28.
 *
 * The state machine is unchanged from the `Sakn Visit Experience.dc.html`
 * port (`active` → `rating` → `done`, note/issue/favourite capture, the
 * best-effort real `POST /visits/{id}/checkout`). What changed is the
 * layout: the screen used to open on a flat navy strip over a thin two-tile
 * grid and read as mostly empty. It now leads with a project hero — real
 * photography, the project's own brand gradient, developer and location
 * built into the image — then a proper 2-column body: documentation cards
 * on one side, a live visit timeline on the other.
 *
 * Emoji glyphs the prototype shipped with (camera, heart, warning, check,
 * stars) are replaced by the shared `brand/Icons` set.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { findProject, loadActivity, money, type DemoBooking } from "@/lib/demo/discoveryFixtures";
import { checkoutVisit } from "@/lib/visits";
import { DEMO_MODE } from "@/lib/demo/config";
import { useVisit } from "@/lib/hooks/useVisits";
import { useDiscoveryProject } from "@/lib/hooks/useDiscovery";
import { backendDiscovery } from "@/lib/backend/discovery";
import { loadPrefs } from "@/lib/demo/discoveryFixtures";
import { ISSUE_CATEGORY_VALUES, SUITABILITY_VALUES } from "@/lib/adapters/visits";
import { MISSING_VALUE } from "@/lib/adapters/discovery";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { HOMEOWNER_PROSPECT_OR_ACTIVE } from "@/lib/auth/roles";
import { MetaPill, SukunWordmark, SectionHeading, brandButton } from "@/components/brand/SukunBrand";
import {
  AlertIcon,
  BedIcon,
  BuildingIcon,
  CalendarIcon,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  HeartIcon,
  NoteIcon,
  PinIcon,
  WalletIcon,
} from "@/components/brand/Icons";

type Phase = "active" | "rating" | "done";
type EventType = "start" | "note" | "like" | "issue" | "finish";
interface VisitEvent { type: EventType; label: string; detail: string; min: number }

const CATS = ["تشطيب", "كهرباء", "سباكة", "اختلاف بالمخطط", "أخرى"];
const SUIT = [["نعم", "var(--ok)"], ["إلى حدٍّ ما", "var(--warn)"], ["لا", "var(--err)"]] as const;
const START_MIN = 16 * 60;

function fmtTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suf = h < 12 ? "ص" : "م";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suf}`;
}

const surface: React.CSSProperties = {
  background: "var(--n-surface)",
  borderRadius: "var(--r-xl)",
  boxShadow: "var(--sh-1), inset 0 0 0 1px var(--n-border)",
};

export function VisitExperienceScreen({ visitId }: { visitId: string }) {
  return (
    <RouteGuard allow={HOMEOWNER_PROSPECT_OR_ACTIVE}>
      <VisitExperienceScreenInner visitId={visitId} />
    </RouteGuard>
  );
}

function VisitExperienceScreenInner({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState<DemoBooking | null>(null);
  /**
   * The LOCAL phase. It only ever advances within this session: check-out moves
   * to `rating`, submitting feedback moves to `done`.
   *
   * It is deliberately NOT the source of truth any more. It used to be — a bare
   * `useState("active")` that never read the server — so a visit the Backend
   * had CANCELLED still rendered as an upcoming visit ("زيارة قادمة"), and a
   * visit that was already CHECKED_OUT rendered as if it had not been. The
   * server's status wins, and `localPhase` may only move the screen FORWARD
   * from it (see `phase` below).
   */
  const [localPhase, setLocalPhase] = useState<Phase | null>(null);
  const [fav, setFav] = useState(false);
  const [events, setEvents] = useState<VisitEvent[]>([{ type: "start", label: "بدأت الزيارة", detail: "", min: 0 }]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueCat, setIssueCat] = useState("");
  const [issueText, setIssueText] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [suitability, setSuitability] = useState("");
  const [toast, setToast] = useState("");
  /** The upcoming-visit reschedule sheet. Real mode only. */
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reDate, setReDate] = useState("");
  const [reTime, setReTime] = useState("");

  /**
   * Task 2 · the ONE data seam on this screen.
   *
   *   DEMO_MODE=true   the local booking record, the fixture project, and the
   *                    in-memory event log — verbatim, no Backend call.
   *   DEMO_MODE=false  `GET /api/visits/{id}` (a foreign visit 404s, existence
   *                    hidden not 403'd) plus `GET /api/discovery/projects/{id}`
   *                    for the hero. Every action below — note, issue,
   *                    favourite, finish, feedback — is a REAL request whose
   *                    response is re-read; the screen never predicts a status
   *                    the server did not return.
   *
   * Visit notes and issues are NOT reports. They stay in the visit domain, and
   * nothing here touches `lib/backend/reports.ts`.
   */
  const live = useVisit(visitId);
  const liveProject = useDiscoveryProject(live.visit?.projectId ?? "", loadPrefs());

  /**
   * THE phase this screen renders.
   *
   * Demo Mode has no server visit, so the local phase is the whole story.
   * Real mode starts from the SERVER's phase (`lib/adapters/visits.ts#phaseOf`,
   * which already maps CANCELLED / CHECKED_OUT / COMPLETED correctly) and lets
   * the local phase move it forward only — so checking out and rating still
   * work within the session, and a hard refresh always lands on the truth.
   */
  const PHASE_ORDER: Phase[] = ["active", "rating", "done"];
  const serverPhase: Phase = live.visit?.phase ?? "active";
  const phase: Phase = DEMO_MODE
    ? (localPhase ?? "active")
    : PHASE_ORDER[Math.max(PHASE_ORDER.indexOf(serverPhase), localPhase ? PHASE_ORDER.indexOf(localPhase) : 0)];
  const setPhase = setLocalPhase;

  /** A cancelled visit is a terminal state of its own — never "upcoming". */
  const isCancelled = !DEMO_MODE && live.visit?.status === "CANCELLED";

  useEffect(() => {
    if (!DEMO_MODE) return;
    const b = loadActivity().bookings.find((x) => x.bookingId === visitId);
    setBooking(b ?? null);
  }, [visitId]);

  const project = DEMO_MODE
    ? (booking ? findProject(booking.id) : findProject(1))
    : liveProject.project;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }
  function pushEvent(ev: Omit<VisitEvent, "min">) {
    setEvents((evs) => [...evs, { ...ev, min: evs.length * 3 }]);
  }
  function toggleFav() {
    const on = !fav;
    setFav(on);
    if (on) {
      // A "liked project" is a discovery favourite, not a visit row — real mode
      // saves it through the real `POST /api/discovery/saved/{projectId}`.
      if (!DEMO_MODE && live.visit) void backendDiscovery.saveProject(live.visit.projectId).catch(() => {});
      pushEvent({ type: "like", label: "أعجبني هذا المشروع", detail: "" });
      showToast("أُضيف للمفضّلة");
    }
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!DEMO_MODE) {
      // `createVisitNoteSchema` requires text and/or a photo. The approved
      // sheet collects text only, so an empty note is not sent at all.
      if (!text) return;
      await live.addNote({ text });
      setNoteOpen(false);
      setNoteText("");
      showToast("حُفظت الملاحظة");
      return;
    }
    pushEvent({ type: "note", label: "أضفت ملاحظة", detail: text || "ملاحظة مصوّرة" });
    setNoteOpen(false);
    setNoteText("");
    showToast("حُفظت الملاحظة");
  }

  async function submitIssue() {
    if (!issueCat) return;
    if (!DEMO_MODE) {
      await live.addIssue({
        category: ISSUE_CATEGORY_VALUES[issueCat] ?? "OTHER",
        description: issueText.trim() || undefined,
      });
      setIssueOpen(false);
      setIssueCat("");
      setIssueText("");
      showToast("أُرسلت الملاحظة للمطوّر");
      return;
    }
    pushEvent({ type: "issue", label: "أبلغت عن ملاحظة", detail: issueCat + (issueText.trim() ? ` · ${issueText.trim()}` : "") });
    setIssueOpen(false);
    setIssueCat("");
    setIssueText("");
    showToast("أُرسلت الملاحظة للمطوّر");
  }

  async function finishVisit() {
    if (!DEMO_MODE) {
      // The REAL checkout. The rating step is entered only once the server has
      // accepted it — `assertFeedbackEligible` requires CHECKED_OUT, so
      // advancing first would offer a step the Backend would then refuse.
      await live.checkOut();
      setPhase("rating");
      window.scrollTo(0, 0);
      return;
    }
    pushEvent({ type: "finish", label: "أنهيت الزيارة", detail: "" });
    setPhase("rating");
    window.scrollTo(0, 0);
    checkoutVisit(visitId).catch(() => {
      /* demo booking id — the real call expectedly fails, see file docstring */
    });
  }

  // In real mode the timeline IS the server's rows (notes + issues + the real
  // check-in/check-out timestamps), rebuilt by the adapter on every re-read.
  const visitEvents = DEMO_MODE ? events : (live.visit?.events ?? []);
  /**
   * Feedback. `createVisitFeedbackSchema` requires a rating and accepts an
   * optional comment and suitability — exactly the three controls this step
   * already has. The "done" step is reached only once the server accepted it;
   * on refusal the resident stays on the rating step rather than being shown a
   * summary of a submission that never landed.
   */
  async function submitVisitFeedback() {
    if (!DEMO_MODE) {
      await live.submitFeedback({
        rating,
        comment: undefined,
        suitability: SUITABILITY_VALUES[suitability],
      });
      if (live.actionError) return;
    }
    setPhase("done");
    window.scrollTo(0, 0);
  }

  const notesCount = DEMO_MODE ? events.filter((e) => e.type === "note").length : (live.visit?.notesCount ?? 0);
  const issuesCount = DEMO_MODE ? events.filter((e) => e.type === "issue").length : (live.visit?.issuesCount ?? 0);
  const obsTotal = notesCount + issuesCount;
  const rShow = Math.max(rating, ratingHover);

  /**
   * Every phase below dereferences `project`. In Demo Mode a fixture always
   * resolves, so this only fires in real mode: the visit or its project is
   * still loading, or the Backend refused to disclose it (a foreign visit 404s
   * — existence hidden, not 403'd). Never a fixture in its place.
   *
   * This used to render the page chrome and nothing else, so a missing or
   * failed visit was an indistinguishable blank screen with no way forward.
   * Each of the three real states now says which one it is, in this app's
   * existing dashed empty-state language, with the same retry the rest of the
   * app uses. Authorization behaviour is unchanged — a 404 stays a 404 and
   * still discloses nothing about whether the visit exists.
   */
  if (!project) {
    const isLoading = live.status === "loading" || live.status === "idle";
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <header style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 26px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <SukunWordmark size={16} tagline="زيارة ميدانية" />
          <span className="sk-only-mobile" style={{ marginInlineStart: "auto" }}><AccountMenu variant="compact" /></span>
        </header>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px" }}>
          {isLoading ? (
            <div style={{ height: "180px", borderRadius: "var(--r-lg)", border: "1px solid var(--n-border)", background: "linear-gradient(90deg,var(--n-surface) 25%,var(--n-surface2) 37%,var(--n-surface) 63%)", backgroundSize: "400% 100%" }} />
          ) : (
            <div style={{ border: "1.5px dashed var(--n-border-strong)", borderRadius: "var(--r-lg)", padding: "36px", textAlign: "center", fontSize: "12.5px", color: "var(--t-tertiary)" }}>
              <div style={{ marginBottom: "14px" }}>
                {live.notFound ? "لم نعثر على هذه الزيارة." : (live.errorMessage ?? "تعذّر تحميل بيانات الزيارة.")}
              </div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                {!live.notFound && (
                  <button onClick={() => live.reload()} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: "var(--r-full)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                    إعادة المحاولة
                  </button>
                )}
                <button onClick={() => router.push(SCREEN_PATHS.H3_Discovery)} style={{ fontSize: "12.5px", fontWeight: 600, padding: "10px 18px", border: "1px solid var(--n-border-strong)", borderRadius: "var(--r-full)", background: "var(--n-surface)", color: "var(--t-secondary)", cursor: "pointer" }}>
                  العودة إلى الاستكشاف
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const EV_ICON: Record<EventType, React.ReactNode> = {
    start: <PinIcon size={15} />,
    note: <NoteIcon size={15} />,
    like: <HeartIcon size={15} filled />,
    issue: <AlertIcon size={15} />,
    finish: <CheckIcon size={15} />,
  };
  const EV_TONE: Record<EventType, string> = {
    start: "var(--g-600)",
    note: "var(--g-600)",
    like: "var(--err)",
    issue: "var(--warn)",
    finish: "var(--ok)",
  };

  /* ----------------------------------------------------------- UPCOMING */
  /**
   * A visit that has NOT been checked into is an UPCOMING visit, not a live one.
   *
   * `lib/adapters/visits.ts` already distinguishes the six statuses correctly —
   * `live` is true only for `CHECKED_IN` — but this screen ignored it and
   * rendered the live presentation for every non-terminal status. A real visit
   * booked for a future date therefore opened with "زيارة جارية · بدأت 4:00 م",
   * a running clock, live note/issue capture and an "إنهاء الزيارة" button that
   * would call `POST /checkout` on a visit the Backend has not checked in.
   *
   * Demo Mode is unchanged: its local booking has no server status and the
   * approved Showcase journey opens directly on the live experience.
   */
  const visitIsLive = DEMO_MODE ? true : (live.visit?.live ?? false);

  if (phase === "active" && !visitIsLive && live.visit) {
    const v = live.visit;
    const statusChip =
      v.status === "SCHEDULED" ? "زيارة مجدولة" : v.status === "CONFIRMED" ? "زيارة مؤكدة" : "زيارة قادمة";

    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <header style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 26px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <SukunWordmark size={16} tagline="زيارة ميدانية" />
          <span className="sk-only-mobile" style={{ marginInlineStart: "auto" }}><AccountMenu variant="compact" /></span>
        </header>

        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 26px 140px" }}>
          <section style={{ position: "relative", borderRadius: "var(--r-2xl)", overflow: "hidden", minHeight: 340, display: "flex", alignItems: "flex-end", boxShadow: "var(--sh-4)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={project.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <span style={{ position: "absolute", inset: 0, background: `${project.grad}`, opacity: 0.82, mixBlendMode: "multiply" }} />
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(13,27,52,.94) 0%, rgba(13,27,52,.45) 45%, rgba(13,27,52,.15) 100%)" }} />

            <div style={{ position: "relative", padding: "34px 34px 32px", color: "var(--t-on-dark)", width: "100%" }}>
              {/* No "زيارة جارية", no running clock: the scheduled slot. */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 700, padding: "8px 15px", borderRadius: "var(--r-full)", background: "rgba(224,178,90,.20)", color: "var(--a-300)", boxShadow: "inset 0 0 0 1px rgba(224,178,90,.32)", backdropFilter: "blur(6px)" }}>
                <CalendarIcon size={14} />
                {statusChip} · <span dir="ltr">{v.date.slice(0, 10)}</span> · {v.time}
              </span>

              <h1 style={{ fontSize: "clamp(28px,3.8vw,42px)", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1.15, margin: "18px 0 10px" }}>{project.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14.5, color: "var(--t-on-dark-soft)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BuildingIcon size={16} />{project.dev}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><PinIcon size={16} />{project.district}، {project.city}</span>
              </div>

              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 22 }}>
                <MetaPill icon={<WalletIcon size={14} />} label={project.price == null ? MISSING_VALUE : money(project.price)} tone="onDark" />
                <MetaPill icon={<BedIcon size={14} />} label={`${project.beds ?? MISSING_VALUE} غرف`} tone="onDark" />
                <MetaPill label={`${project.area ?? MISSING_VALUE} م²`} tone="onDark" />
                <MetaPill label={project.avail} tone="onDark" />
              </div>
            </div>
          </section>

          <div style={{ display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1fr)", marginTop: 36 }} className="sk-visit-split">
            <div>
              <SectionHeading title="تفاصيل زيارتك" hint="ستتمكّن من توثيق ملاحظاتك بمجرّد بدء الزيارة في الموعد." />
              <div style={{ ...surface, padding: "22px 24px", display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginBottom: 4 }}>التاريخ</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }} dir="ltr">{v.date.slice(0, 10)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginBottom: 4 }}>الوقت</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{v.time}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginBottom: 4 }}>الوحدة</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }} dir="ltr">{v.unitNumber || MISSING_VALUE}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginBottom: 4 }}>الحالة</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{statusChip}</div>
                </div>
              </div>

              <div style={{ ...surface, marginTop: 22, padding: "20px 22px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ color: "var(--a-600)", flex: "none", marginTop: 1 }}><NoteIcon size={19} /></span>
                <p style={{ fontSize: 13.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: 0 }}>
                  انظر إلى ما لا تُظهره الصور: اتجاه الشمس داخل الغرف، مستوى الضجيج من الشارع، ضغط المياه، وجودة
                  التشطيب عند الزوايا. هذه التفاصيل هي ما ستقارنه لاحقاً بين المشاريع.
                </p>
              </div>
            </div>

            <aside>
              <SectionHeading title="إدارة الزيارة" />
              <div style={{ ...surface, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                {v.canReschedule ? (
                  <button onClick={() => { setReDate(v.date.slice(0, 10)); setReTime(v.time); setRescheduleOpen(true); }} style={{ ...brandButton("ghost"), width: "100%" }}>
                    إعادة جدولة الزيارة
                  </button>
                ) : null}
                {v.canCancel ? (
                  <button disabled={live.acting} onClick={() => void live.cancel()} style={{ ...brandButton("ghost"), width: "100%", color: "var(--err)", borderColor: "var(--err-border)" }}>
                    إلغاء الزيارة
                  </button>
                ) : null}
                {!v.canReschedule && !v.canCancel && (
                  <div style={{ fontSize: 13, color: "var(--t-tertiary)", lineHeight: 1.7 }}>
                    لا تتوفّر إجراءات على هذه الزيارة في حالتها الحالية.
                  </div>
                )}
                {v.rescheduleCount > 0 && (
                  <div style={{ fontSize: 12, color: "var(--t-tertiary)" }}>أُعيدت جدولة هذه الزيارة {v.rescheduleCount} مرة.</div>
                )}
                {live.actionError && (
                  <div style={{ fontSize: 12.5, color: "var(--err)", lineHeight: 1.6 }}>{live.actionError}</div>
                )}
              </div>
            </aside>
          </div>
        </main>

        {/* No finish bar. Check-in is the only forward action, and only when the
            Backend says the visit may be checked into. */}
        {v.canCheckIn && (
          <div data-sk-cta-bar style={{ position: "fixed", bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 40, padding: "14px 26px calc(14px + env(safe-area-inset-bottom,0px))", background: "rgba(252,248,242,.92)", backdropFilter: "blur(14px)", borderTop: "1px solid var(--n-border)" }}>
            <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>وصلت إلى المشروع؟</div>
                <div style={{ fontSize: 12.5, color: "var(--t-tertiary)", marginTop: 2 }}>ابدأ الزيارة لتتمكّن من تسجيل ملاحظاتك.</div>
              </div>
              <button disabled={live.acting} onClick={() => void live.checkIn()} style={brandButton("primary")}>
                بدء الزيارة
              </button>
            </div>
          </div>
        )}

        {rescheduleOpen && (
          <Sheet title="إعادة جدولة الزيارة" onClose={() => setRescheduleOpen(false)}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>التاريخ</label>
            <input type="date" value={reDate} onChange={(e) => setReDate(e.target.value)} style={sheetField} />
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, margin: "14px 0 6px" }}>الوقت</label>
            <input type="time" value={reTime} onChange={(e) => setReTime(e.target.value)} style={sheetField} />
            <button
              disabled={live.acting || !reDate || !reTime}
              onClick={async () => {
                await live.reschedule({ date: reDate, time: reTime });
                setRescheduleOpen(false);
              }}
              style={{ ...brandButton("primary"), width: "100%", marginTop: 18 }}
            >
              تأكيد الموعد الجديد
            </button>
          </Sheet>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- ACTIVE */
  if (phase === "active") {
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "var(--n-bg)" }}>
        <header style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 26px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <SukunWordmark size={16} tagline="زيارة ميدانية" />
          <span className="sk-only-mobile" style={{ marginInlineStart: "auto" }}><AccountMenu variant="compact" /></span>
        </header>

        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 26px 140px" }}>
          {/* ------------------------------------------------------- hero */}
          <section
            style={{
              position: "relative",
              borderRadius: "var(--r-2xl)",
              overflow: "hidden",
              minHeight: 340,
              display: "flex",
              alignItems: "flex-end",
              boxShadow: "var(--sh-4)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.img}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: `${project.grad}`,
                opacity: 0.82,
                mixBlendMode: "multiply",
              }}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(13,27,52,.94) 0%, rgba(13,27,52,.45) 45%, rgba(13,27,52,.15) 100%)",
              }}
            />

            <div style={{ position: "relative", padding: "34px 34px 32px", color: "var(--t-on-dark)", width: "100%" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 12.5,
                  fontWeight: 700,
                  padding: "8px 15px",
                  borderRadius: "var(--r-full)",
                  background: "rgba(47,158,106,.22)",
                  color: "var(--ok-on-dark)",
                  boxShadow: "inset 0 0 0 1px rgba(140,233,184,.3)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--ok-on-dark)",
                    animation: "sk-breathe 1.6s var(--ease) infinite",
                  }}
                />
                زيارة جارية · بدأت {fmtTime(START_MIN)}
              </span>

              <h1
                style={{
                  fontSize: "clamp(28px,3.8vw,42px)",
                  fontWeight: 700,
                  letterSpacing: "-1px",
                  lineHeight: 1.15,
                  margin: "18px 0 10px",
                }}
              >
                {project.name}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14.5, color: "var(--t-on-dark-soft)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <BuildingIcon size={16} />
                  {project.dev}
                </span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <PinIcon size={16} />
                  {project.district}، {project.city}
                </span>
              </div>

              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 22 }}>
                <MetaPill icon={<WalletIcon size={14} />} label={project.price == null ? MISSING_VALUE : money(project.price)} tone="onDark" />
                <MetaPill icon={<BedIcon size={14} />} label={`${project.beds ?? MISSING_VALUE} غرف`} tone="onDark" />
                <MetaPill label={`${project.area ?? MISSING_VALUE} م²`} tone="onDark" />
                <MetaPill label={project.avail} tone="onDark" />
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------- body */}
          <div style={{ display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1fr)", marginTop: 36 }} className="sk-visit-split">
            <div>
              <SectionHeading
                title="وثّق زيارتك"
                hint="كل ما تسجّله هنا يُحفظ في ملف الزيارة، ويظهر في مقارنتك بين المشاريع لاحقاً."
                action={
                  <span style={{ fontSize: 12.5, color: "var(--t-tertiary)", whiteSpace: "nowrap" }}>
                    {obsTotal === 0 ? "لا ملاحظات بعد" : `${obsTotal} ملاحظة`}
                  </span>
                }
              />

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
                <DocCard
                  icon={<CameraIcon size={22} />}
                  tint="var(--g-600)"
                  tintBg="var(--g-50)"
                  title="التقاط ملاحظة"
                  sub="صوّر تفصيلة وأضف تعليقاً سريعاً."
                  onClick={() => setNoteOpen(true)}
                  delay={0}
                />
                <DocCard
                  icon={<HeartIcon size={22} filled={fav} />}
                  tint={fav ? "var(--t-on-dark)" : "var(--err)"}
                  tintBg={fav ? "var(--err)" : "var(--err-bg)"}
                  title={fav ? "أعجبني" : "أعجبني"}
                  sub={fav ? "محفوظ في مفضّلتك." : "احفظ المشروع في المفضّلة."}
                  onClick={toggleFav}
                  active={fav}
                  delay={70}
                />
                <DocCard
                  icon={<AlertIcon size={22} />}
                  tint="var(--warn)"
                  tintBg="var(--warn-bg)"
                  title="الإبلاغ عن ملاحظة"
                  sub="تُرسل للمطوّر قبل الشراء."
                  onClick={() => setIssueOpen(true)}
                  delay={140}
                />
              </div>

              <div
                style={{
                  ...surface,
                  marginTop: 22,
                  padding: "20px 22px",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--a-600)", flex: "none", marginTop: 1 }}>
                  <NoteIcon size={19} />
                </span>
                <p style={{ fontSize: 13.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: 0 }}>
                  انظر إلى ما لا تُظهره الصور: اتجاه الشمس داخل الغرف، مستوى الضجيج من الشارع، ضغط المياه، وجودة
                  التشطيب عند الزوايا. هذه التفاصيل هي ما ستقارنه لاحقاً بين المشاريع.
                </p>
              </div>
            </div>

            {/* timeline */}
            <aside>
              <SectionHeading title="مسار الزيارة" />
              <div style={{ ...surface, padding: "22px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {visitEvents.map((e, i) => {
                    const last = i === visitEvents.length - 1;
                    return (
                      <div key={i} className="sk-rise" style={{ display: "flex", gap: 14, animationDelay: `${i * 60}ms` }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background: "var(--n-surface2)",
                              color: EV_TONE[e.type],
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "inset 0 0 0 1px var(--n-border)",
                            }}
                          >
                            {EV_ICON[e.type]}
                          </span>
                          {!last && <span style={{ width: 2, flex: 1, minHeight: 22, background: "var(--n-border)", marginTop: 4 }} />}
                        </div>
                        <div style={{ paddingBottom: last ? 0 : 20 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{e.label}</div>
                          {e.detail && (
                            <div style={{ fontSize: 12.5, color: "var(--t-secondary)", marginTop: 3, lineHeight: 1.6 }}>{e.detail}</div>
                          )}
                          <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginTop: 4 }}>{fmtTime(START_MIN + e.min)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
        </main>

        {/* finish bar */}
        <div
          data-sk-cta-bar
          style={{
            position: "fixed",
            bottom: 0,
            insetInlineStart: 0,
            insetInlineEnd: 0,
            zIndex: 40,
            padding: "14px 26px calc(14px + env(safe-area-inset-bottom,0px))",
            background: "rgba(252,248,242,.92)",
            backdropFilter: "blur(14px)",
            borderTop: "1px solid var(--n-border)",
          }}
        >
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>انتهيت من التجوّل؟</div>
              <div style={{ fontSize: 12.5, color: "var(--t-tertiary)", marginTop: 2 }}>
                {obsTotal > 0 ? `${obsTotal} ملاحظة محفوظة` : "لم تسجّل أي ملاحظة بعد"}
              </div>
            </div>
            <button disabled={live.acting} onClick={() => void finishVisit()} style={brandButton("primary")}>
              إنهاء الزيارة
            </button>
          </div>
        </div>

        {noteOpen && (
          <Sheet title="التقاط ملاحظة" onClose={() => setNoteOpen(false)}>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="مثال: الإضاءة الطبيعية في الصالة ممتازة صباحاً…"
              style={sheetField}
            />
            <button disabled={live.acting} onClick={() => void saveNote()} style={{ ...brandButton("primary"), width: "100%", marginTop: 18 }}>
              حفظ الملاحظة
            </button>
          </Sheet>
        )}

        {issueOpen && (
          <Sheet title="الإبلاغ عن ملاحظة" onClose={() => setIssueOpen(false)}>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--t-secondary)",
                background: "var(--n-surface2)",
                borderRadius: "var(--r-md)",
                padding: "12px 14px",
                margin: "0 0 18px",
                lineHeight: 1.65,
                boxShadow: "inset 0 0 0 1px var(--n-border)",
              }}
            >
              هذه ليست مطالبة ضمان — بل ملاحظة زيارة تُرسل للمطوّر قبل الشراء.
            </p>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>التصنيف</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {CATS.map((c) => {
                const on = issueCat === c;
                return (
                  <button
                    key={c}
                    onClick={() => setIssueCat(c)}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: "var(--r-full)", border: "none", cursor: "pointer",
                      background: on ? "var(--g-900)" : "var(--n-surface)",
                      color: on ? "var(--t-on-dark)" : "var(--t-secondary)",
                      boxShadow: on ? "var(--sh-1)" : "inset 0 0 0 1.5px var(--n-border-strong)",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>الوصف (اختياري)</div>
            <textarea value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="اشرح الملاحظة باختصار…" style={sheetField} />
            <button
              disabled={!issueCat || live.acting}
              onClick={() => void submitIssue()}
              style={{ ...brandButton("primary"), width: "100%", marginTop: 18, opacity: issueCat ? 1 : 0.5, cursor: issueCat ? "pointer" : "not-allowed" }}
            >
              إرسال الملاحظة
            </button>
          </Sheet>
        )}

        {toast && <Toast text={toast} />}

        <style jsx global>{`
          @media (min-width: 940px) {
            .sk-visit-split {
              grid-template-columns: 1.5fr 1fr !important;
              align-items: start;
            }
          }
        `}</style>
      </div>
    );
  }

  /* ---------------------------------------------------------- CANCELLED */
  /**
   * A cancelled visit is its own terminal state.
   *
   * Production rendered it as "زيارة قادمة" with a date and time, because this
   * screen's phase was local `useState("active")` and never read the server.
   * `CANCELLED` may never read as upcoming, may never offer reschedule,
   * check-in, notes, issues or checkout, and must say what it is. Same
   * `Centered` shell, same card language as the completed state.
   */
  if (isCancelled) {
    return (
      <Centered>
        <div style={{ textAlign: "center" }}>
          <span
            style={{
              width: 82, height: 82, margin: "0 auto 22px", borderRadius: "50%",
              background: "var(--n-surface2)", color: "var(--t-tertiary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 0 0 1px var(--n-border-strong)",
            }}
          >
            <CloseIcon size={34} />
          </span>
          <h1 style={{ fontSize: "clamp(24px,3vw,30px)", fontWeight: 700, letterSpacing: "-.6px", margin: 0 }}>
            زيارة ملغاة
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: "12px 0 26px" }}>
            أُلغيت هذه الزيارة ولم تعد ضمن زياراتك القادمة. يمكنك حجز موعد جديد في أي وقت.
          </p>
        </div>

        <div style={{ ...surface, overflow: "hidden" }}>
          <div style={{ height: 108, position: "relative", background: `url(${project.img}) center/cover` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={project.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.32 }} />
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: "1px solid var(--n-border)", marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{project.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--t-tertiary)", marginTop: 2 }}>{project.dev} · {project.district}</div>
              </div>
              <MetaPill label="ملغاة" tone="neutral" />
            </div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13.5 }}>
              <div>
                <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginBottom: 3 }}>الموعد الملغى</div>
                <div style={{ fontWeight: 700 }} dir="ltr">{live.visit?.date.slice(0, 10)} · {live.visit?.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginBottom: 3 }}>الوحدة</div>
                <div style={{ fontWeight: 700 }} dir="ltr">{live.visit?.unitNumber || MISSING_VALUE}</div>
              </div>
            </div>
          </div>
        </div>

        <button onClick={() => router.push(SCREEN_PATHS.H3_Discovery)} style={{ ...brandButton("primary"), width: "100%", marginTop: 22 }}>
          العودة إلى لوحتي
        </button>
      </Centered>
    );
  }

  /* ------------------------------------------------------------- RATING */
  if (phase === "rating") {
    return (
      <Centered>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--a-700)", letterSpacing: ".2px" }}>انتهت الزيارة</div>
          <h1 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 700, letterSpacing: "-.6px", margin: "10px 0 8px" }}>
            كيف كانت زيارتك لـ{project.name}؟
          </h1>
          <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.8, margin: 0 }}>
            تقييمك يضبط ترشيحات المستشار القادمة لك.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 32 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setRatingHover(n)}
              onMouseLeave={() => setRatingHover(0)}
              aria-label={`${n} من 5`}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: n <= rShow ? "var(--a-400)" : "var(--n-border-strong)",
                transform: n <= rShow ? "scale(1.06)" : "none",
                transition: "transform .18s var(--ease), color .18s var(--ease)",
              }}
            >
              <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m12 3.4 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.6l5.9-.8Z" />
              </svg>
            </button>
          ))}
        </div>

        <div style={{ ...surface, padding: "24px 26px" }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 16 }}>هل المشروع مناسب لك؟</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {SUIT.map(([label, color]) => {
              const on = suitability === label;
              return (
                <button
                  key={label}
                  onClick={() => setSuitability(label)}
                  style={{
                    padding: "15px 8px",
                    borderRadius: "var(--r-lg)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13.5,
                    fontWeight: 600,
                    background: on ? "var(--n-bg)" : "var(--n-surface)",
                    color: on ? color : "var(--t-secondary)",
                    boxShadow: on ? `inset 0 0 0 1.5px ${color}` : "inset 0 0 0 1.5px var(--n-border)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          disabled={!rating || live.acting}
          onClick={() => void submitVisitFeedback()}
          style={{ ...brandButton("primary"), width: "100%", marginTop: 22, opacity: rating ? 1 : 0.5, cursor: rating ? "pointer" : "not-allowed" }}
        >
          إنهاء
        </button>
        <button
          onClick={() => { setPhase("done"); window.scrollTo(0, 0); }}
          style={{ display: "block", margin: "14px auto 0", fontSize: 13, fontWeight: 600, color: "var(--t-tertiary)", background: "none", border: "none", cursor: "pointer" }}
        >
          تخطّي التقييم
        </button>
      </Centered>
    );
  }

  /* --------------------------------------------------------------- DONE */
  return (
    <Centered>
      <div style={{ textAlign: "center" }}>
        <span
          style={{
            width: 82,
            height: 82,
            margin: "0 auto 22px",
            borderRadius: "50%",
            background: "var(--ok-bg)",
            color: "var(--ok)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 0 0 1px rgba(47,158,106,.28)",
            animation: "pop .5s var(--ease)",
          }}
        >
          <CheckIcon size={38} />
        </span>
        <h1 style={{ fontSize: "clamp(24px,3vw,30px)", fontWeight: 700, letterSpacing: "-.6px", margin: 0 }}>
          شكراً — انتهت زيارتك
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: "12px 0 26px" }}>
          حُفظت ملاحظاتك، وتحوّلت الزيارة إلى «مكتملة» في لوحتك.
        </p>
      </div>

      <div style={{ ...surface, overflow: "hidden" }}>
        <div style={{ height: 108, position: "relative", background: `url(${project.img}) center/cover` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.32 }} />
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: "1px solid var(--n-border)", marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{project.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--t-tertiary)", marginTop: 2 }}>{project.dev} · {project.district}</div>
            </div>
            <MetaPill label="مكتملة" tone="ok" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              { v: String(notesCount), l: "ملاحظة", c: "var(--g-700)" },
              { v: String(issuesCount), l: "بلاغ", c: "var(--warn)" },
              { v: rating ? `${rating}/5` : "—", l: "تقييمك", c: "var(--a-600)" },
            ].map((s) => (
              <div key={s.l} style={{ textAlign: "center", background: "var(--n-bg)", borderRadius: "var(--r-md)", padding: "14px 8px" }}>
                <div style={{ fontSize: 21, fontWeight: 700, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11.5, color: "var(--t-tertiary)", marginTop: 3 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button onClick={() => router.push(SCREEN_PATHS.H3_Discovery)} style={{ ...brandButton("primary"), width: "100%", marginTop: 22 }}>
        العودة إلى لوحتي
      </button>
    </Centered>
  );
}

/* --------------------------------------------------------------- pieces */

function DocCard({
  icon, tint, tintBg, title, sub, onClick, active, delay,
}: {
  icon: React.ReactNode; tint: string; tintBg: string; title: string; sub: string;
  onClick: () => void; active?: boolean; delay: number;
}) {
  return (
    <button
      onClick={onClick}
      className="sk-rise sk-doccard"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 16,
        textAlign: "right",
        padding: "24px 22px",
        borderRadius: "var(--r-xl)",
        border: "none",
        cursor: "pointer",
        background: "var(--n-surface)",
        boxShadow: active
          ? "var(--sh-2), inset 0 0 0 1.5px rgba(188,70,48,.35)"
          : "var(--sh-1), inset 0 0 0 1px var(--n-border)",
        animationDelay: `${delay}ms`,
        transition: "transform .18s var(--ease), box-shadow .18s var(--ease)",
      }}
    >
      <span
        style={{
          width: 50, height: 50, borderRadius: "var(--r-lg)", background: tintBg, color: tint,
          display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
        }}
      >
        {icon}
      </span>
      <span>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15.5, fontWeight: 700 }}>
          {title}
          {active && <CheckIcon size={15} />}
        </span>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--t-tertiary)", marginTop: 4, lineHeight: 1.6 }}>{sub}</span>
      </span>
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "var(--n-bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ maxWidth: 1180, margin: "0 auto", width: "100%", padding: "18px 26px 0" }}>
        <SukunWordmark size={16} tagline="زيارة ميدانية" />
          <span className="sk-only-mobile" style={{ marginInlineStart: "auto" }}><AccountMenu variant="compact" /></span>
      </header>
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px 70px" }}>
        <div style={{ width: "100%", maxWidth: 520, animation: "sk-reveal .5s var(--ease) both" }}>{children}</div>
      </main>
    </div>
  );
}

const sheetField: React.CSSProperties = {
  width: "100%",
  minHeight: 100,
  padding: "14px 16px",
  fontSize: 14.5,
  lineHeight: 1.7,
  borderRadius: "var(--r-md)",
  border: "1.5px solid var(--n-border-strong)",
  background: "var(--n-bg)",
  resize: "vertical",
};

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 130, background: "rgba(13,27,52,.44)",
        backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          width: "100%", maxWidth: 560, background: "var(--n-surface)",
          borderRadius: "var(--r-2xl) var(--r-2xl) 0 0", padding: "26px 26px calc(26px + env(safe-area-inset-bottom,0px))",
          boxShadow: "var(--sh-4)", animation: "sk-rise .32s var(--ease) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 17.5, fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer",
              background: "var(--n-surface2)", color: "var(--t-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "fixed", bottom: 108, insetInlineStart: "50%", transform: "translateX(-50%)", zIndex: 160,
        display: "flex", alignItems: "center", gap: 10, background: "var(--g-900)", color: "var(--t-on-dark)",
        padding: "13px 22px", borderRadius: "var(--r-full)", boxShadow: "var(--sh-4)", fontSize: 14, fontWeight: 600,
        animation: "sk-rise .3s var(--ease) both",
      }}
    >
      <CheckIcon size={16} />
      {text}
    </div>
  );
}
