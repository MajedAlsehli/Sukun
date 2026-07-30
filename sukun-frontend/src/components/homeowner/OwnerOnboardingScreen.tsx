"use client";

/**
 * H6 · تفعيل الوحدة — ported from `Sakn Owner Onboarding.dc.html` (Sakn.d.zip,
 * sole production source). The source itself has no real backend call —
 * `runValidation` resolves a hardcoded set of test codes via a `setTimeout`,
 * not a `fetch` — matching the fact that Task 011 (Homeowner Activation,
 * `/auth/set-password` + `/auth/verify-ownership`) is unbuilt. This is
 * ported exactly as authored, not stubbed further: it was already a demo
 * flow in the production export itself.
 *
 * **Dropped:** the "الشاشات" screens-launcher FAB — prototype QA tooling,
 * same category as `support.js`/`image-slot.js` per `01_Page_Inventory.md`
 * §3, same precedent already set for H1/H2.
 *
 * **Literal-source note, now resolved:** `18_Frontend_Navigation_Integration.md`
 * describes H6's only exit as "success → H7 (الدخول إلى منزلي)"; the file's
 * own success button ("الدخول إلى لوحة المالك") instead led through a 3-card
 * intro sequence to a "dashboard handoff" screen whose own copy said the
 * real dashboard was "خارج نطاق هذا النموذج" (out of this prototype's
 * scope) — true only because H7 didn't exist yet when this file was
 * authored. It exists now (this session): the 3-card intro is kept exactly
 * as authored (real onboarding content, not a placeholder), but its final
 * step now persists the activation flag and does a real (hard) redirect to H7
 * instead of rendering the literal "dashboard handoff" screen — the
 * "never leave a screen permanently disconnected once its target exists"
 * rule (`07_Frontend_Status.md` §2) applies here exactly as it does to
 * every RE-series cross-link.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { getStoredUser, storeHomeownerActivated } from "@/lib/api";
import { HOMEOWNER_PENDING_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { DEMO_MODE } from "@/lib/demo/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { useActivation } from "@/lib/hooks/useActivation";
import { ImageSlotPlaceholder } from "@/components/ImageSlotPlaceholder";
import { SukunLogo } from "@/components/brand/SukunLogo";

type Screen = "welcome" | "before" | "help" | "connect" | "scan" | "validating" | "result" | "success" | "onboard" | "empty";
type ResultKey = "invalid" | "expired" | "linked" | "notfound" | "devnotfound" | "server";

const STAGE_OF: Partial<Record<Screen, number>> = { welcome: 0, before: 0, help: 0, connect: 1, scan: 1, validating: 1, result: 1, success: 2, onboard: 2 };
const BACK_MAP: Partial<Record<Screen, Screen>> = { before: "welcome", help: "before", connect: "before", scan: "connect", result: "connect" };

const RESULTS: Record<ResultKey, { tint: string; tintBg: string; icon: ReactNode; title: string; what: string; why: string; next: string; actLabel: string }> = {
  invalid: { tint: "var(--err)", tintBg: "var(--err-bg)", icon: <ErrIcon1 />, title: "الرمز غير صحيح", what: "الرمز الذي أدخلته غير مطابق لأي وحدة في سكن.", why: "قد يكون هناك خطأ إملائي، أو أن الرمز غير مكتمل.", next: "تأكّد من الرمز كما يظهر في مستنداتك وأعد إدخاله.", actLabel: "إعادة المحاولة" },
  expired: { tint: "var(--warn)", tintBg: "var(--warn-bg)", icon: <ClockIcon />, title: "انتهت صلاحية الرمز", what: "هذا الرمز لم يعد صالحًا للاستخدام.", why: "تنتهي صلاحية رموز التفعيل بعد فترة محددة لحماية وحدتك.", next: "تواصل مع المطوّر العقاري للحصول على رمز تفعيل جديد.", actLabel: "إدخال رمز آخر" },
  linked: { tint: "var(--info)", tintBg: "var(--info-bg)", icon: <LinkIcon />, title: "الوحدة مرتبطة بحساب آخر", what: "هذه الوحدة مسجّلة بالفعل على حساب آخر في سكن.", why: "لا يمكن ربط الوحدة الواحدة بأكثر من حساب في الوقت نفسه.", next: "إذا كنت المالك الجديد، تواصل مع المطوّر لنقل ملكية الوحدة إلى حسابك.", actLabel: "إدخال رمز آخر" },
  notfound: { tint: "var(--warn)", tintBg: "var(--warn-bg)", icon: <SearchXIcon />, title: "لم نعثر على الوحدة", what: "لا توجد وحدة مطابقة لهذا الرمز في سكن حتى الآن.", why: "قد يكون المطوّر لم يُفعّل هذه الوحدة في المنصّة بعد.", next: "تواصل مع المطوّر العقاري للتأكد من تفعيل وحدتك ثم أعد المحاولة.", actLabel: "إعادة المحاولة" },
  devnotfound: { tint: "var(--info)", tintBg: "var(--info-bg)", icon: <DevIcon />, title: "المطوّر غير مسجّل بعد", what: "المطوّر المرتبط بهذا الرمز لم ينضم إلى منصّة سكن بعد.", why: "يتم التحقق من كل وحدة عبر مطوّرها المسجّل في سكن.", next: "سنُشعرك فور انضمام هذا المطوّر؛ يمكنك المحاولة لاحقًا.", actLabel: "حسنًا" },
  server: { tint: "var(--err)", tintBg: "var(--err-bg)", icon: <WarnTriIcon />, title: "تعذّر إكمال العملية", what: "حدث خطأ غير متوقع أثناء التحقق من الوحدة.", why: "المشكلة من جانبنا وليست بسببك، وقد تكون مؤقتة.", next: "أعد المحاولة بعد لحظات، وإن استمرت المشكلة تواصل مع الدعم.", actLabel: "إعادة المحاولة" },
};

const HELP_CARDS = [
  { title: "تواصل مع المطوّر العقاري", body: "رمز التفعيل يصدره المطوّر العقاري الذي اشتريت منه وحدتك، وهو المسؤول عن إصداره لكل وحدة.", icon: <BuildingBadgeIcon />, list: [] as string[] },
  { title: "أين أجد الرمز؟", body: "عادةً ما يصلك رمز الوحدة عبر إحدى هذه القنوات:", icon: <DocIcon />, list: ["عند استلام الوحدة", "داخل مستندات التسليم", "عبر رسالة SMS", "عبر البريد الإلكتروني"] },
  { title: "ما زلت لا أجده", body: "إذا لم تستلم رمز الوحدة، تواصل مع المطوّر العقاري ليقوم بإعادة إرساله إليك.", icon: <QuestionIcon />, list: [] as string[] },
];

const UNIT_ROWS = [
  { k: "اسم المشروع", v: "مشروع تالا ريزيدنس", dir: "rtl" },
  { k: "رقم الوحدة", v: "A-142", dir: "ltr" },
  { k: "المطوّر", v: "شركة الأفق للتطوير العقاري", dir: "rtl" },
  { k: "المدينة", v: "الرياض", dir: "rtl" },
];

const CARDS = [
  { tint: "var(--g-700)", tintBg: "var(--g-50)", title: "الضمان", body: "اعرف ما إذا كانت المشكلة مشمولة بالضمان قبل أن تبلّغ عنها.", icon: <ShieldIcon /> },
  { tint: "var(--a-700)", tintBg: "var(--a-50)", title: "البلاغات", body: "أبلغ عن أي مشكلة داخل وحدتك بسهولة وفي أي وقت.", icon: <WrenchIcon /> },
  { tint: "var(--info)", tintBg: "var(--info-bg)", title: "متابعة الإصلاح", body: "تابع حالة البلاغ خطوةً بخطوة حتى يتم إغلاقه بالكامل.", icon: <PinIcon /> },
];

/**
 * `SAKN-DEMO-001` — the canonical demo activation code (2026-07-28, user
 * instruction): always resolves to success, both typed manually and as the
 * QR payload (`startScan` already force-succeeds regardless of code, since
 * the camera scan itself is simulated — this constant is what that flow's
 * own copy/QR graphic should be understood to encode). Checked before the
 * `SAKN-XXXXXX` test-code regex below since its shape (three hyphenated
 * segments) doesn't fit that pattern.
 */
export const DEMO_ACTIVATION_CODE = "SAKN-DEMO-001";

/** Mirrors `sakn-backend/src/auth/auth.dto.ts#passwordSchema`, nothing more. */
const PASSWORD_MIN_LENGTH = 8;
export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN_LENGTH} أحرف.`;
  if (!/[a-z]/.test(pw)) return "كلمة المرور يجب أن تحتوي على حرف إنجليزي صغير.";
  if (!/[A-Z]/.test(pw)) return "كلمة المرور يجب أن تحتوي على حرف إنجليزي كبير.";
  if (!/[0-9]/.test(pw)) return "كلمة المرور يجب أن تحتوي على رقم.";
  if (pw !== confirm) return "كلمتا المرور غير متطابقتين.";
  return null;
}

function resolveCode(code: string): ResultKey | "success" {
  const c = code.trim().toUpperCase();
  if (c === DEMO_ACTIVATION_CODE) return "success";
  if (!/^SAKN-[A-Z0-9]{6}$/.test(c)) return "invalid";
  const suf = c.slice(5);
  const map: Record<string, ResultKey | "success"> = { "82HJQ4": "success", EXP001: "expired", LNK777: "linked", DEV404: "devnotfound", ERR500: "server" };
  return map[suf] ?? "notfound";
}

export function OwnerOnboardingScreen() {
  return (
    <RouteGuard allow={HOMEOWNER_PENDING_ONLY}>
      <OwnerOnboardingInner />
    </RouteGuard>
  );
}

function OwnerOnboardingInner() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ResultKey>("invalid");
  const [cardIndex, setCardIndex] = useState(0);
  const [readyForHome, setReadyForHome] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activation = useActivation();
  const { setBackendSession } = useAuth();

  /**
   * Task 3 · Step 6 — the APPROVED minimal addition.
   *
   * `activateHomeownerSchema` requires `{ code, password }` (Decision 013:
   * activation IS the moment the customer sets their password), and Task 2
   * recorded the missing field as a blocker rather than inventing a credential.
   * This adds the smallest thing that closes it: two password inputs on the
   * EXISTING `connect` card, below the existing code input.
   *
   * Why this is the smallest possible visual change:
   *   * no new screen, no new step, no change to `STAGE_OF` or `BACK_MAP` —
   *     the flow is still welcome → before → connect → validating → result;
   *   * the fields reuse `codeInputStyle`'s own card language, spacing and RTL
   *     behaviour, and sit inside the card that is already there;
   *   * every other screen, transition and string is untouched;
   *   * Demo Mode never renders them, so all 52 baseline captures are unchanged.
   *
   * The policy below mirrors `auth.dto.ts#passwordSchema` so the resident is
   * told the rule before the server refuses them — it does not replace the
   * server's validation, which still runs and still decides.
   */
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwTouched, setPwTouched] = useState(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Deliberately writes the activation flag straight to storage
  // (`storeHomeownerActivated`) instead of calling `AuthContext`'s
  // React-state-updating `markHomeownerActivated`. Updating that state
  // while still mounted flips `sessionRole` to `homeowner_active`, which
  // makes *this* screen's own `RouteGuard` (homeowner_pending only) fire
  // its own competing "role no longer allowed here" redirect to "/" —
  // racing (and beating, in testing) our intended redirect to H7. Since
  // we're about to hard-navigate away regardless, there is nothing for the
  // local React state to do — H7 re-hydrates `AuthContext` fresh from the
  // just-persisted flag on load, with no competing in-flight redirect from
  // the page being left.
  useEffect(() => {
    if (readyForHome) window.location.href = SCREEN_PATHS.H7_MyHome;
  }, [readyForHome]);

  function nav(sc: Screen, extra?: { code?: string; result?: ResultKey; cardIndex?: number }) {
    if (timer.current) clearTimeout(timer.current);
    setScreen(sc);
    if (extra?.code !== undefined) setCode(extra.code);
    if (extra?.result !== undefined) setResult(extra.result);
    if (extra?.cardIndex !== undefined) setCardIndex(extra.cardIndex);
  }

  /**
   * Task 2 · real activation.
   *
   * Demo Mode keeps the approved synthetic journey verbatim: `resolveCode`'s
   * hard-coded test codes, the 1.9s "verifying" beat, the six result cards.
   *
   * Real mode calls `POST /api/homeowners/activate`. On success the Backend has
   * already consumed the one-time code, promoted the user to `HOMEOWNER` and
   * set a fresh refresh cookie, so the session it returns is adopted verbatim
   * and the SERVER-DERIVED role (`homeowner_active`) is what routes the user —
   * no local activation flag is written.
   *
   * ── Known blocker, recorded not worked around ──────────────────────────────
   * `activateHomeownerSchema` requires `{ code, password }`; the APPROVED screen
   * collects only a code and adding a password step is a frozen-design change
   * (confirmed with the user, 2026-07-29). Real-mode activation therefore
   * reaches the Backend and is refused with `VALIDATION_ERROR`, which
   * `activationResultFor` maps onto this screen's EXISTING "تعذّر إكمال
   * العملية" card. No credential is fabricated to work around it.
   */
  function runValidation(forcedKey?: ResultKey | "success") {
    nav("validating");
    if (timer.current) clearTimeout(timer.current);

    if (!DEMO_MODE) {
      void activation.activate(code, password).then((key) => {
        if (key === "success") nav("success");
        else nav("result", { result: key });
      });
      return;
    }

    timer.current = setTimeout(() => {
      const key = forcedKey ?? resolveCode(code);
      if (key === "success") nav("success");
      else nav("result", { result: key });
    }, 1900);
  }

  function submitCode() {
    if (!code.trim()) return;
    // Real mode: the password is required by the Backend, so it is validated
    // here first rather than sending a request that is certain to 400.
    if (!DEMO_MODE) {
      setPwTouched(true);
      if (passwordProblem(password, confirm)) return;
    }
    runValidation();
  }
  function startScan() {
    nav("scan");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runValidation("success"), 2600);
  }
  /**
   * Leaves H6 for H7.
   *
   * Demo Mode writes the synthetic activation flag to storage exactly as
   * before (the file docstring explains why it deliberately bypasses
   * `AuthContext`'s state-updating `markHomeownerActivated`: updating it while
   * still mounted makes THIS screen's own pending-only guard race our redirect).
   *
   * Real mode never writes that flag — activation is a server fact. It adopts
   * the session the Backend returned, whose `role` is already
   * `homeowner_active`, and the frozen route table does the rest.
   */
  function finishActivation() {
    if (DEMO_MODE) {
      storeHomeownerActivated(getStoredUser()?.id ?? null);
    } else if (activation.session) {
      setBackendSession(activation.session);
    }
    setReadyForHome(true);
  }

  function nextCard() {
    if (cardIndex >= 2) {
      finishActivation();
      return;
    }
    setCardIndex((i) => i + 1);
  }

  const stage = STAGE_OF[screen];
  const showSteps = stage !== undefined;
  const backTo = BACK_MAP[screen];
  const res = RESULTS[result];
  const card = CARDS[cardIndex] ?? CARDS[0];

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ position: "relative", minHeight: "100dvh", overflow: "hidden" }}>
      <div style={{ position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "34px 20px 64px" }}>
        <div style={{ width: "100%", maxWidth: "472px" }}>
          <div style={{ position: "relative", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-2xl)", boxShadow: "var(--sh-4)", padding: "30px 30px 34px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", minHeight: "34px" }}>
              {backTo ? (
                <button onClick={() => nav(backTo)} aria-label="رجوع" style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--n-border)", borderRadius: "var(--r-md)", background: "var(--n-surface2)", color: "var(--t-secondary)", cursor: "pointer", flex: "none" }}>
                  <BackChevronIcon />
                </button>
              ) : (
                <SukunLogo size={34} />
              )}
              {showSteps ? (
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ height: "6px", borderRadius: "var(--r-full)", transition: "all .35s var(--ease)", width: i === stage ? "22px" : "6px", background: i <= (stage ?? -1) ? "var(--g-700)" : "var(--n-border-strong)" }} />
                  ))}
                </div>
              ) : (
                <span style={{ width: "34px" }} />
              )}
            </div>

            <div key={screen}>
              {screen === "welcome" && (
                <div style={{ textAlign: "center", paddingTop: "8px" }}>
                  <div style={{ position: "relative", height: "196px", margin: "6px 0 26px", borderRadius: "var(--r-xl)", overflow: "hidden", background: "var(--g-900)" }}>
                    <div style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
                      <ImageSlotPlaceholder label="صورة: مالك يستلم مفاتيح منزله من المطوّر" src="/projects/handover-family.jpg" />
                    </div>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(var(--g-900-rgb), .35),rgba(var(--g-900-rgb), .72))" }} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><KeyIcon /></div>
                  </div>
                  <span style={{ display: "inline-block", fontSize: "12px", fontWeight: 600, color: "var(--a-700)", background: "var(--a-50)", padding: "6px 14px", borderRadius: "var(--r-full)", marginBottom: "16px" }}>رحلة التملّك</span>
                  <h1 style={{ fontSize: "29px", fontWeight: 700, letterSpacing: "-.5px", lineHeight: 1.3, margin: 0 }}>مرحبًا بك في رحلة إدارة وحدتك</h1>
                  <p style={{ fontSize: "15.5px", color: "var(--t-secondary)", lineHeight: 1.8, margin: "15px 0 30px" }}>إذا كنت تمتلك وحدة سكنية، يمكنك ربطها بحسابك لإدارة الضمان والبلاغات والصيانة من مكان واحد.</p>
                  <PrimaryButton onClick={() => nav("before")}>ربط وحدتي</PrimaryButton>
                </div>
              )}

              {screen === "before" && (
                <div style={{ paddingTop: "12px" }}>
                  <IconTile><UnitIcon /></IconTile>
                  <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>كيف تربط وحدتك؟</h1>
                  <p style={{ fontSize: "15px", color: "var(--t-secondary)", lineHeight: 1.8, margin: "13px 0 22px" }}>بعد استلام وحدتك، يمنحك المطوّر العقاري رمز تفعيل خاصًا لكل وحدة. يمكنك استخدام هذا الرمز أو مسح رمز <span dir="ltr">QR</span> لربط الوحدة بحسابك.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--a-50)", border: "1px solid var(--a-100)", borderRadius: "var(--r-md)", padding: "14px 16px", marginBottom: "26px" }}>
                    <InfoIcon />
                    <span style={{ fontSize: "13px", color: "var(--a-800)", lineHeight: 1.6 }}>لا نحتاج منك أي مستندات ملكية — الرمز وحده يكفي لتأكيد وحدتك.</span>
                  </div>
                  <PrimaryButton onClick={() => nav("connect")}>لدي رمز الوحدة</PrimaryButton>
                  <SecondaryButton onClick={() => nav("help")}>لا أملك رمز الوحدة</SecondaryButton>
                </div>
              )}

              {screen === "help" && (
                <div style={{ paddingTop: "10px" }}>
                  <h1 style={{ fontSize: "25px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>لا تملك رمز الوحدة؟</h1>
                  <p style={{ fontSize: "14.5px", color: "var(--t-secondary)", lineHeight: 1.8, margin: "12px 0 22px" }}>لا تقلق، يمكنك الحصول على رمز الوحدة مباشرةً من المطوّر العقاري الذي اشتريت منه.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {HELP_CARDS.map((c) => (
                      <div key={c.title} style={{ display: "flex", gap: "14px", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", padding: "16px", boxShadow: "var(--sh-1)" }}>
                        <span style={{ width: "44px", height: "44px", borderRadius: "var(--r-md)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{c.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "5px" }}>{c.title}</div>
                          <div style={{ fontSize: "13px", color: "var(--t-secondary)", lineHeight: 1.65 }}>{c.body}</div>
                          {c.list.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "10px" }}>
                              {c.list.map((li) => <span key={li} style={{ fontSize: "12px", color: "var(--g-700)", background: "var(--g-50)", padding: "5px 11px", borderRadius: "var(--r-full)" }}>{li}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "24px" }}><PrimaryButton onClick={() => nav("before")}>حسنًا</PrimaryButton></div>
                </div>
              )}

              {screen === "connect" && (
                <div style={{ paddingTop: "10px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>ربط وحدتك</h1>
                  <p style={{ fontSize: "14.5px", color: "var(--t-secondary)", lineHeight: 1.75, margin: "11px 0 22px" }}>امسح رمز <span dir="ltr">QR</span> الموجود في مستندات التسليم، أو أدخل رمز الوحدة يدويًا.</p>
                  <button onClick={startScan} style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", fontSize: "16px", fontWeight: 600, padding: "18px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>
                    <span style={{ width: "38px", height: "38px", borderRadius: "var(--r-sm)", background: "rgba(var(--a-500-rgb), .2)", color: "var(--a-300)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><QrIcon /></span>
                    <span style={{ flex: 1, textAlign: "right" }}>مسح رمز <span dir="ltr">QR</span></span>
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "22px 0" }}><span style={{ flex: 1, height: "1px", background: "var(--n-border)" }} /><span style={{ fontSize: "12.5px", color: "var(--t-tertiary)" }}>أو أدخل الرمز</span><span style={{ flex: 1, height: "1px", background: "var(--n-border)" }} /></div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "9px" }}>رمز الوحدة</label>
                  <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={DEMO_ACTIVATION_CODE} maxLength={13} autoComplete="off" spellCheck={false} style={codeInputStyle} />
                  <p style={{ fontSize: "12.5px", color: "var(--t-tertiary)", lineHeight: 1.7, margin: "11px 2px 22px" }}>ستجد رمز الوحدة في المستندات التي استلمتها من المطوّر العقاري.</p>

                  {/* Task 3 · Step 6 — the approved minimal addition. Real mode
                      only: the Backend sets the account's password during
                      activation, so it must be collected here. Demo Mode
                      renders nothing, which is why every baseline capture is
                      unchanged. The inputs reuse this card's own label and
                      field styling verbatim. */}
                  {!DEMO_MODE && (
                    <>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--t-secondary)", marginBottom: "9px" }}>كلمة المرور</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        style={{ ...codeInputStyle, letterSpacing: "normal", textAlign: "start", fontSize: "16px" }}
                      />
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--t-secondary)", margin: "16px 0 9px" }}>تأكيد كلمة المرور</label>
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        style={{ ...codeInputStyle, letterSpacing: "normal", textAlign: "start", fontSize: "16px" }}
                      />
                      <p style={{ fontSize: "12.5px", color: pwTouched && passwordProblem(password, confirm) ? "var(--err)" : "var(--t-tertiary)", lineHeight: 1.7, margin: "11px 2px 22px" }}>
                        {pwTouched && passwordProblem(password, confirm)
                          ? passwordProblem(password, confirm)
                          : "٨ أحرف على الأقل، وتشمل حرفاً كبيراً وحرفاً صغيراً ورقماً."}
                      </p>
                    </>
                  )}
                  <button onClick={submitCode} disabled={!code.trim()} style={{ width: "100%", fontSize: "16px", fontWeight: 600, padding: "16px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: code.trim() ? "pointer" : "not-allowed", opacity: code.trim() ? 1 : 0.5 }}>ربط الوحدة</button>
                </div>
              )}

              {screen === "scan" && (
                <div style={{ paddingTop: "8px", textAlign: "center" }}>
                  <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.3px", margin: "0 0 6px" }}>امسح رمز <span dir="ltr">QR</span></h1>
                  <p style={{ fontSize: "14px", color: "var(--t-secondary)", lineHeight: 1.7, margin: "0 0 22px" }}>وجّه الكاميرا نحو الرمز في مستندات التسليم.</p>
                  <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", maxWidth: "280px", margin: "0 auto", borderRadius: "var(--r-xl)", overflow: "hidden", background: "linear-gradient(160deg,var(--g-800),var(--g-900))" }}>
                    <div style={{ position: "absolute", top: "16px", right: "16px", width: "34px", height: "34px", borderTop: "3px solid var(--a-300)", borderRight: "3px solid var(--a-300)", borderTopRightRadius: "8px" }} />
                    <div style={{ position: "absolute", top: "16px", left: "16px", width: "34px", height: "34px", borderTop: "3px solid var(--a-300)", borderLeft: "3px solid var(--a-300)", borderTopLeftRadius: "8px" }} />
                    <div style={{ position: "absolute", bottom: "16px", right: "16px", width: "34px", height: "34px", borderBottom: "3px solid var(--a-300)", borderRight: "3px solid var(--a-300)", borderBottomRightRadius: "8px" }} />
                    <div style={{ position: "absolute", bottom: "16px", left: "16px", width: "34px", height: "34px", borderBottom: "3px solid var(--a-300)", borderLeft: "3px solid var(--a-300)", borderBottomLeftRadius: "8px" }} />
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "9px", marginTop: "22px", fontSize: "13.5px", color: "var(--t-secondary)" }}>
                    <span style={{ width: "15px", height: "15px", border: "2px solid var(--g-300)", borderTopColor: "var(--g-600)", borderRadius: "50%" }} />
                    جارٍ البحث عن الرمز…
                  </div>
                  <button onClick={() => nav("connect")} style={{ display: "block", width: "100%", fontSize: "14px", fontWeight: 600, padding: "13px", marginTop: "20px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>إدخال الرمز يدويًا بدلاً من ذلك</button>
                </div>
              )}

              {screen === "validating" && (
                <div style={{ padding: "44px 0 40px", textAlign: "center" }}>
                  <div style={{ position: "relative", width: "96px", height: "96px", margin: "0 auto 28px" }}>
                    <span style={{ position: "absolute", inset: 0, border: "3px solid var(--g-100)", borderTopColor: "var(--g-600)", borderRadius: "50%" }} />
                    <span style={{ position: "absolute", inset: "26px", borderRadius: "50%", background: "var(--g-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><UnitIconSm /></span>
                  </div>
                  <h1 style={{ fontSize: "21px", fontWeight: 700, margin: 0 }}>جارٍ التحقّق من بيانات الوحدة…</h1>
                  <p style={{ fontSize: "14px", color: "var(--t-secondary)", lineHeight: 1.7, margin: "12px 0 0" }}>نتأكّد من الرمز لدى المطوّر العقاري. لن يستغرق ذلك سوى لحظات.</p>
                </div>
              )}

              {screen === "result" && (
                <div style={{ paddingTop: "6px", textAlign: "center" }}>
                  <div style={{ width: "76px", height: "76px", margin: "6px auto 22px", borderRadius: "50%", background: res.tintBg, color: res.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{res.icon}</div>
                  <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.3px", margin: 0 }}>{res.title}</h1>
                  <p style={{ fontSize: "14.5px", color: "var(--t-secondary)", lineHeight: 1.75, margin: "12px 0 22px" }}>{res.what}</p>
                  <div style={{ textAlign: "right", background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", overflow: "hidden", boxShadow: "var(--sh-1)" }}>
                    <div style={{ display: "flex", gap: "12px", padding: "14px 16px", borderBottom: "1px solid var(--n-border)" }}>
                      <InfoIconTertiary />
                      <div><div style={{ fontSize: "12px", fontWeight: 700, color: "var(--t-tertiary)", marginBottom: "3px" }}>لماذا حدث ذلك</div><div style={{ fontSize: "13.5px", color: "var(--t-secondary)", lineHeight: 1.6 }}>{res.why}</div></div>
                    </div>
                    <div style={{ display: "flex", gap: "12px", padding: "14px 16px" }}>
                      <ArrowLeftIcon />
                      <div><div style={{ fontSize: "12px", fontWeight: 700, color: "var(--g-700)", marginBottom: "3px" }}>ماذا تفعل الآن</div><div style={{ fontSize: "13.5px", color: "var(--t-primary)", lineHeight: 1.6 }}>{res.next}</div></div>
                    </div>
                  </div>
                  <div style={{ marginTop: "22px" }}>
                    <PrimaryButton onClick={() => (result === "server" ? runValidation() : nav("connect"))}>{res.actLabel}</PrimaryButton>
                  </div>
                  <button onClick={() => nav("help")} style={{ width: "100%", fontSize: "14px", fontWeight: 600, padding: "13px", marginTop: "11px", border: "none", borderRadius: "var(--r-md)", background: "transparent", color: "var(--t-secondary)", cursor: "pointer" }}>تحتاج مساعدة في الرمز؟</button>
                </div>
              )}

              {screen === "success" && (
                <div style={{ paddingTop: "6px", textAlign: "center" }}>
                  <div style={{ position: "relative", width: "92px", height: "92px", margin: "8px auto 24px" }}>
                    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ok-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><CheckIcon /></span>
                  </div>
                  <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>تم ربط وحدتك بنجاح</h1>
                  <p style={{ fontSize: "14.5px", color: "var(--t-secondary)", lineHeight: 1.75, margin: "13px 0 24px" }}>أصبحت وحدتك الآن مرتبطة بحسابك، ويمكنك إدارة جميع خدمات ما بعد التملّك من خلال سكن.</p>
                  <div style={{ textAlign: "right", background: "var(--g-900)", borderRadius: "var(--r-xl)", padding: "6px 22px", boxShadow: "var(--sh-2)" }}>
                    {UNIT_ROWS.map((r, i) => (
                      <div key={r.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i === UNIT_ROWS.length - 1 ? "none" : "1px solid rgba(var(--t-on-dark-rgb), .08)" }}>
                        <span style={{ fontSize: "13px", color: "var(--t-on-dark-soft)", flex: "none" }}>{r.k}</span>
                        <span style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--t-on-dark)", textAlign: "left", paddingRight: "16px" }} dir={r.dir}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "24px" }}><PrimaryButton onClick={() => nav("onboard", { cardIndex: 0 })}>الدخول إلى لوحة المالك</PrimaryButton></div>
                </div>
              )}

              {screen === "onboard" && (
                <div style={{ paddingTop: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "8px" }}><button onClick={() => { finishActivation(); }} style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--t-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "4px" }}>تخطّي</button></div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: "104px", height: "104px", margin: "8px auto 26px", borderRadius: "var(--r-2xl)", background: card.tintBg, color: card.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{card.icon}</div>
                    <h1 style={{ fontSize: "25px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>{card.title}</h1>
                    <p style={{ fontSize: "15px", color: "var(--t-secondary)", lineHeight: 1.8, margin: "13px 0 28px", minHeight: "52px" }}>{card.body}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "24px" }}>
                    {[0, 1, 2].map((i) => <span key={i} style={{ height: "7px", borderRadius: "var(--r-full)", transition: "all .3s var(--ease)", width: i === cardIndex ? "20px" : "7px", background: i === cardIndex ? "var(--g-700)" : "var(--n-border-strong)" }} />)}
                  </div>
                  <PrimaryButton onClick={nextCard}>{cardIndex >= 2 ? "ابدأ" : "التالي"}</PrimaryButton>
                </div>
              )}

              {screen === "empty" && (
                <div style={{ padding: "20px 0 8px", textAlign: "center" }}>
                  <div style={{ width: "104px", height: "104px", margin: "0 auto 24px", borderRadius: "var(--r-2xl)", background: "var(--n-surface2)", border: "1.5px dashed var(--n-border-strong)", color: "var(--t-tertiary)", display: "flex", alignItems: "center", justifyContent: "center" }}><UnitIconLg /></div>
                  <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>لم تقم بربط أي وحدة بعد</h1>
                  <p style={{ fontSize: "14.5px", color: "var(--t-secondary)", lineHeight: 1.75, margin: "13px 0 26px" }}>اربط وحدتك السكنية لتبدأ في إدارة الضمان والبلاغات والصيانة من مكان واحد.</p>
                  <PrimaryButton onClick={() => nav("welcome")}>ربط وحدة</PrimaryButton>
                </div>
              )}

            </div>
          </div>
          <p style={{ textAlign: "center", fontSize: "11.5px", color: "var(--t-tertiary)", margin: "20px 0 0" }}>حسابٌ واحد في سكن مدى الحياة · يمكنك ربط أكثر من وحدة</p>
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ width: "100%", fontSize: "16px", fontWeight: 600, padding: "16px", border: "none", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", cursor: "pointer", boxShadow: "var(--sh-1)" }}>{children}</button>;
}
function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ width: "100%", fontSize: "15px", fontWeight: 600, padding: "15px", marginTop: "12px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "transparent", color: "var(--t-primary)", cursor: "pointer" }}>{children}</button>;
}
function IconTile({ children }: { children: ReactNode }) {
  return <div style={{ width: "60px", height: "60px", borderRadius: "var(--r-lg)", background: "var(--g-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>{children}</div>;
}
const codeInputStyle: React.CSSProperties = { width: "100%", fontSize: "19px", letterSpacing: "3px", textAlign: "center", padding: "16px 15px", border: "1.5px solid var(--n-border-strong)", borderRadius: "var(--r-md)", background: "var(--n-surface)", color: "var(--t-primary)", outline: "none", fontWeight: 600 };

function BackChevronIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>; }
function KeyIcon() { return <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--a-300)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.5 12.5 8-8" /><path d="m16 5 3 3" /><path d="m19.5 4.5 1.5 1.5" /></svg>; }
function UnitIcon() { return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></svg>; }
function UnitIconSm() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--g-700)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>; }
function UnitIconLg() { return <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></svg>; }
function InfoIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--a-700)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>; }
function InfoIconTertiary() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--t-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "1px" }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>; }
function ArrowLeftIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--g-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: "1px" }}><path d="M9 18l6-6-6-6" /></svg>; }
function QrIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="7" width="10" height="10" rx="1" /></svg>; }
function CheckIcon() { return <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function ErrIcon1() { return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>; }
function ClockIcon() { return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></svg>; }
function LinkIcon() { return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a3 3 0 1 0-2.83-4M6 12a3 3 0 1 0 2.83 4" /><path d="m8.6 13.5 6.8-3" /><rect x="2" y="9" width="6" height="6" rx="3" /><rect x="16" y="9" width="6" height="6" rx="3" /></svg>; }
function SearchXIcon() { return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M11 8v3M11 14h.01" /></svg>; }
function DevIcon() { return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M9 7h.01M9 12h.01" /><path d="m15 7 4 4M19 7l-4 4" /></svg>; }
function WarnTriIcon() { return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>; }
function BuildingBadgeIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" /></svg>; }
function DocIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>; }
function QuestionIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>; }
function ShieldIcon() { return <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>; }
function WrenchIcon() { return <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>; }
function PinIcon() { return <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>; }
