"use client";

/**
 * H2 · تسجيل الدخول / إنشاء حساب (Auth) — ported from the production export
 * `Sakn Auth.dc.html` (re-verified 2026-07-27 against a freshly-provided
 * copy of the same file — byte-identical to the one originally used, so no
 * version conflict; the gap was in this port, not the source). Markup/
 * inline-styles/animations are pixel-for-pixel from that file for every
 * screen this component implements.
 *
 * **Screen inventory vs. the source file** — the source defines more
 * screens than this component wires live; each exclusion below is a
 * deliberate, documented decision, not an oversight (the `journey`/
 * `journeyInd` screens WERE an oversight, fixed 2026-07-27 — see
 * `project-memory/02_Development_Log.md` for the full correction):
 * - Included, exact: welcome, journey (كيف ترغب باستخدام سكن؟), journeyInd
 *   (ما الذي ترغب به اليوم؟), login, register (individual + enterprise),
 *   forgot, reset, created.
 * - Excluded — `verify` (email verification): Task 001's `/auth/register`
 *   returns an active session immediately; there is no verification step
 *   on the backend to drive this screen.
 * - Excluded — `role` (generic self-service role picker, offering
 *   "المستفيد/المقاول/مدير المشروع/الشركة العقارية" as pickable roles):
 *   contradicts the backend's server-assigned role model — registration
 *   always creates `HOME_SEEKER`; no endpoint anywhere lets a caller
 *   self-declare a different role. Wiring this screen would let the UI
 *   promise something the backend can never do.
 * - Excluded — `approval` ("تم استلام طلب انضمام مؤسستك… قيد المراجعة"):
 *   would be a fake success — no `POST /companies` (or equivalent)
 *   endpoint exists (Architecture Freeze AF-004). Kept the existing
 *   honest "غير متاح حالياً" state instead, matching this codebase's own
 *   established precedent of never faking a success the backend can't
 *   deliver.
 * - Excluded — `loading` (the fake "جارٍ تجهيز مساحتك" progress screen)
 *   and the floating "screens launcher" FAB: prototype/QA scaffolding,
 *   not specified product behavior — same category as `support.js`/
 *   `image-slot.js` per `01_Page_Inventory.md` §3.
 */

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import {
  clearPendingJourney,
  getPendingJourney,
  getStoredHomeownerActivated,
  getStoredOwnerIntent,
  normalizeSaudiPhone,
  storePendingJourney,
} from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { ImageSlotPlaceholder } from "@/components/ImageSlotPlaceholder";
import { DEMO_MODE } from "@/lib/demo/config";
import { backendAuth } from "@/lib/backend/auth";
import { BackendErrorCode, isApiError } from "@/lib/backend/errors";
import { DEFAULT_ROUTE_FOR_ROLE } from "@/lib/auth/routeRoles";
import type { AppRole } from "@/lib/auth/roles";

type Screen = "welcome" | "journey" | "journeyInd" | "login" | "register" | "forgot" | "reset" | "created" | "loading";
type Journey = "individual" | "enterprise" | null;
type JourneySub = "search" | "owner" | null;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAUDI_MOBILE_REGEX = /^05\d{8}$/;
function vEmail(x: string): boolean {
  return EMAIL_REGEX.test((x || "").trim());
}
function vIdentifier(x: string): boolean {
  const trimmed = (x || "").trim();
  return EMAIL_REGEX.test(trimmed) || SAUDI_MOBILE_REGEX.test(trimmed);
}

interface ErrDef {
  t: string;
  m: string;
  a?: string;
  act?: () => void;
}

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 14,
  color: "var(--t-secondary)",
  background: "none",
  border: "none",
  cursor: "pointer",
  marginBottom: 22,
};

function BackChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/** The "journey" screen's card style — icon + title/desc + a prominent "متابعة" pill. */
function JourneyCard({
  title,
  desc,
  icon,
  onClick,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "var(--n-surface)",
        border: "1.5px solid var(--n-border)",
        borderRadius: "var(--r-lg)",
        padding: 20,
        cursor: "pointer",
        boxShadow: "var(--sh-1)",
      }}
    >
      <span style={{ width: 52, height: 52, borderRadius: "var(--r-md)", background: "var(--a-50)", color: "var(--g-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--t-secondary)", lineHeight: 1.55, marginTop: 4 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, padding: "11px 20px", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", flex: "none", whiteSpace: "nowrap" }}>
        متابعة
      </span>
    </div>
  );
}

/** The "journeyInd" screen's card style — icon + title/desc + a circular chevron, a plainer row-selector look than JourneyCard. */
function IndividualCard({
  title,
  desc,
  icon,
  onClick,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "var(--n-surface)",
        border: "1.5px solid var(--n-border)",
        borderRadius: "var(--r-lg)",
        padding: 20,
        cursor: "pointer",
        boxShadow: "var(--sh-1)",
      }}
    >
      <span style={{ width: 52, height: 52, borderRadius: "var(--r-md)", background: "var(--g-50)", color: "var(--g-600)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--t-secondary)", lineHeight: 1.55, marginTop: 4 }}>{desc}</div>
      </div>
      <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--n-surface2)", color: "var(--g-600)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </span>
    </div>
  );
}

function EyeIcon({ shown }: { shown: boolean }) {
  return shown ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      <path d="m3 3 18 18" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ErrorBanner({ err }: { err: ErrDef }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 11,
        padding: "13px 15px",
        background: "var(--err-bg)",
        border: "1px solid rgba(188,70,48,.3)",
        borderRadius: "var(--r-md)",
        marginBottom: 20,
      }}
    >
      <span style={{ color: "var(--err)", flex: "none", marginTop: 1 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--err-strong)" }}>{err.t}</div>
        <div style={{ fontSize: 13, color: "var(--err-strong)", marginTop: 2 }}>{err.m}</div>
        {err.a && (
          <button
            onClick={err.act}
            style={{
              marginTop: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--err)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {err.a}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 14.5,
  border: "1.5px solid var(--n-border)",
  borderRadius: "var(--r-md)",
  background: "var(--n-surface)",
  color: "var(--t-primary)",
  outline: "none",
};
const inputErrStyle: CSSProperties = { ...inputStyle, borderColor: "var(--err)" };

const primaryBtn: CSSProperties = {
  width: "100%",
  fontSize: 16,
  fontWeight: 600,
  padding: 15,
  border: "none",
  borderRadius: "var(--r-md)",
  background: "var(--g-900)",
  color: "var(--t-on-dark)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};

function Spinner() {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: "2px solid rgba(243,236,226,.35)",
        borderTopColor: "var(--t-on-dark)",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
  );
}

export function AuthScreen({ initialScreen = "welcome" }: { initialScreen?: Screen }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * The reset token from the emailed link. `null` means the link is missing or
   * malformed, which the reset screen must SAY rather than presenting a form
   * whose submit handler returns early and does nothing.
   */
  const resetToken = searchParams.get("token");
  const { setBackendSession, markOwnerIntent } = useAuth();

  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [journey, setJourney] = useState<Journey>(null);
  // `journeySub` ("search" vs "owner") — both individual cards land on the
  // exact same register form (`/auth/register` only ever creates a
  // HOME_SEEKER row, no real HOMEOWNER signup path exists yet, Task 011),
  // but "owner" drives a real difference afterwards: see
  // `postAuthDestination` below, which routes into H6 activation instead of
  // H3 Discovery. This state is a convenience copy only — the durable
  // record is `api.ts#storePendingJourney`, written the instant the card is
  // clicked, because this state does not survive a remount.
  const [journeySub, setJourneySub] = useState<JourneySub>(null);

  const [liEmail, setLiEmail] = useState("");
  const [liPass, setLiPass] = useState("");
  const [liShow, setLiShow] = useState(false);
  const [liRemember, setLiRemember] = useState(false);
  const [liStatus, setLiStatus] = useState<"idle" | "loading" | "done">("idle");
  const [liError, setLiError] = useState<string | null>(null);
  // The Backend's own derived role (`homeowner_prospect` … `company`) — resolved
  // server-side by `accountState.ts`, never re-derived here (decisions.md A1/D2).
  const [loggedInRole, setLoggedInRole] = useState<AppRole | null>(null);
  const [registeredRole, setRegisteredRole] = useState<AppRole | null>(null);

  const [rgName, setRgName] = useState("");
  const [rgEmail, setRgEmail] = useState("");
  const [rgPhone, setRgPhone] = useState("");
  const [rgPass, setRgPass] = useState("");
  const [rgPass2, setRgPass2] = useState("");
  const [rgTerms, setRgTerms] = useState(false);
  const [rgStatus, setRgStatus] = useState<"idle" | "loading">("idle");
  const [rgError, setRgError] = useState<string | null>(null);

  const [coName, setCoName] = useState("");
  const [coCr, setCoCr] = useState("");
  const [coEmail, setCoEmail] = useState("");
  const [coPhone, setCoPhone] = useState("");
  const [coCity, setCoCity] = useState("اختر المدينة");
  const [coTerms, setCoTerms] = useState(false);
  const [coError, setCoError] = useState<string | null>(null);

  const [fgEmail, setFgEmail] = useState("");
  const [fgStatus, setFgStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [fgError, setFgError] = useState<string | null>(null);

  const [rsPass, setRsPass] = useState("");
  const [rsPass2, setRsPass2] = useState("");
  const [rsShow, setRsShow] = useState(false);
  const [rsStatus, setRsStatus] = useState<"idle" | "loading" | "done">("idle");

  const [createdName, setCreatedName] = useState("");

  function nav(next: Screen, extra?: { journey?: Journey; journeySub?: JourneySub }) {
    setScreen(next);
    setLiError(null);
    setRgError(null);
    setCoError(null);
    setFgError(null);
    if (extra?.journey !== undefined) setJourney(extra.journey);
    if (extra?.journeySub !== undefined) {
      setJourneySub(extra.journeySub);
      // Persisted immediately, not just held in React state — registration
      // spans several screens and any remount in between used to silently
      // drop the "لدي وحدة سكنية" choice (see api.ts#storePendingJourney).
      if (extra.journeySub) storePendingJourney(extra.journeySub);
    }
  }

  /**
   * The one destination resolver both registration and login use.
   *
   * **Real mode.** The Backend resolves the account's state itself — one
   * server-side resolver (`sakn-backend/src/auth/accountState.ts`) turns
   * `User.role` plus the latest `HomeownerActivation` row into one of the six
   * roles this app already models, and returns it as `role` on every
   * session-producing response. So the destination is a pure lookup in
   * `DEFAULT_ROUTE_FOR_ROLE`, and a home seeker who has since been assigned a
   * unit by a company is routed to `/activate` because the *server* says
   * `homeowner_pending` — not because a localStorage flag survived.
   *
   * The Backend also returns its own `landingRoute`, which is deliberately
   * ignored: it mirrors the Vite app's URL table (`/discover`,
   * `/technician/tasks`), and those paths do not exist in this frozen route
   * table. Same six roles, different URLs — see `lib/auth/routeRoles.ts`.
   *
   * **Demo Mode.** The legacy mocked bridge is preserved verbatim below. The
   * "لدي وحدة سكنية" choice (durable in `sakn_pending_journey`, promoted to
   * `sakn_owner_intent`) is what let a `HOME_SEEKER` present as
   * `homeowner_pending` before the Backend could say so itself. It stays live
   * for the synthetic journeys and is never consulted in real mode, where it
   * would contradict a real account fact.
   */
  function postAuthDestination(role: AppRole) {
    if (DEMO_MODE) {
      const isOwnerJourney =
        journeySub === "owner" || getPendingJourney() === "owner" || getStoredOwnerIntent();

      if (role === "homeowner_prospect" && isOwnerJourney) {
        markOwnerIntent();
        clearPendingJourney();
        router.push(
          getStoredHomeownerActivated() ? SCREEN_PATHS.H7_MyHome : SCREEN_PATHS.H6_OwnerOnboarding,
        );
        return;
      }
    }

    clearPendingJourney();
    router.push(DEFAULT_ROUTE_FOR_ROLE[role]);
  }

  useEffect(() => {
    if (screen !== "created") return;
    // Same 1200 ms dwell on the approved "تم إنشاء الحساب" screen. The role is
    // whatever the real registration response resolved to — `homeowner_prospect`
    // for a plain sign-up, `homeowner_pending` if a company had already assigned
    // this person a unit before they registered.
    const t = setTimeout(() => postAuthDestination(registeredRole ?? "homeowner_prospect"), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, registeredRole]);

  const LIERR: Record<string, ErrDef> = {
    invalid_credentials: {
      t: "بيانات الدخول غير صحيحة",
      m: "تأكّد من البريد الإلكتروني أو رقم الجوال وكلمة المرور وحاول مجدداً.",
      a: "نسيت كلمة المرور؟",
      act: () => nav("forgot"),
    },
    account_locked: {
      t: "الحساب مقفل مؤقتاً",
      m: "تم قفل الحساب مؤقتاً بعد عدة محاولات دخول فاشلة. حاول لاحقاً أو أعد تعيين كلمة المرور.",
      a: "إعادة تعيين كلمة المرور",
      act: () => nav("forgot"),
    },
    account_inactive: {
      t: "الحساب غير مُفعّل",
      m: "هذا الحساب غير نشط حالياً.",
    },
    network: {
      t: "خطأ في الاتصال",
      m: "تحقّق من اتصالك بالإنترنت وحاول مجدداً.",
      a: "إعادة المحاولة",
      act: () => void submitLogin(),
    },
    validation: {
      t: "تحقّق من البيانات",
      m: "يرجى إدخال بريد إلكتروني أو رقم جوال صحيح وكلمة المرور.",
    },
  };

  const RGERR: Record<string, ErrDef> = {
    email_exists: {
      t: "البريد مستخدم بالفعل",
      m: "هذا البريد مسجّل مسبقاً.",
      a: "تسجيل الدخول",
      act: () => nav("login"),
    },
    phone_exists: {
      t: "رقم الجوال مستخدم بالفعل",
      m: "هذا الرقم مسجّل مسبقاً.",
      a: "تسجيل الدخول",
      act: () => nav("login"),
    },
    weak_password: { t: "كلمة المرور ضعيفة", m: "استخدم 8 أحرف على الأقل." },
    mismatch: { t: "كلمتا المرور غير متطابقتين", m: "تأكّد من تطابق كلمتَي المرور." },
    validation: { t: "تحقّق من البيانات", m: "يرجى تعبئة جميع الحقول والموافقة على الشروط." },
    network: { t: "خطأ في الاتصال", m: "تحقّق من اتصالك بالإنترنت وحاول مجدداً." },
  };

  const COMPANY_NOT_AVAILABLE: ErrDef = {
    t: "غير متاح حالياً",
    m: "تسجيل حسابات المؤسسات العقارية يتم حالياً عبر فريق سكن مباشرة، وسيُتاح التسجيل الذاتي في مرحلة لاحقة من المنصة.",
  };

  /**
   * Maps a thrown value onto one of `LIERR`'s existing keys. No new error state
   * is introduced — every branch lands on copy that is already on screen today.
   *
   * `TOO_MANY_REQUESTS` (the Backend's 20-requests/15-minutes-per-IP auth
   * limiter, which also counts the silent refresh every page load fires) maps to
   * `account_locked`: of the five existing states it is the only one whose copy
   * says "try again later" rather than implying a wrong password or a dead
   * connection.
   */
  function loginErrorKey(err: unknown): string {
    if (!isApiError(err)) return "network";
    switch (err.errorCode) {
      case BackendErrorCode.ACCOUNT_LOCKED:
      case BackendErrorCode.TOO_MANY_REQUESTS:
        return "account_locked";
      case BackendErrorCode.ACCOUNT_DEACTIVATED:
      case BackendErrorCode.ACCESS_DENIED:
        return "account_inactive";
      default:
        // INVALID_CREDENTIALS, and VALIDATION_ERROR — which is what the Backend
        // answers when the identifier is a mobile number, since `loginSchema`
        // accepts an email only and no phone-login route exists. The form's own
        // label and placeholder are frozen, so the honest outcome is the same
        // "بيانات الدخول غير صحيحة" banner a wrong password produces.
        return "invalid_credentials";
    }
  }

  async function submitLogin() {
    if (!vIdentifier(liEmail) || !liPass) {
      setLiError("validation");
      return;
    }
    setLiStatus("loading");
    setLiError(null);
    try {
      const session = await backendAuth.login({ email: liEmail.trim(), password: liPass });
      // The access token goes to the in-memory store inside `setBackendSession`;
      // the rotating refresh token never reaches this code — the Backend set it
      // as an httpOnly cookie on this very response.
      setBackendSession(session);
      setLoggedInRole(session.role as AppRole);
      setLiStatus("done");
    } catch (err) {
      setLiError(loginErrorKey(err));
      setLiStatus("idle");
    }
  }

  async function submitRegister() {
    if (!rgName || !vEmail(rgEmail) || !rgPhone || !rgPass || !rgTerms) {
      setRgError("validation");
      return;
    }
    if (rgPass.length < 8) {
      setRgError("weak_password");
      return;
    }
    if (rgPass !== rgPass2) {
      setRgError("mismatch");
      return;
    }
    setRgStatus("loading");
    setRgError(null);
    try {
      const session = await backendAuth.register({
        name: rgName,
        email: rgEmail.trim(),
        // `registerSchema` takes the local `05XXXXXXXX` shape; the signup field's
        // placeholder shows the international form. Normalized here rather than
        // changing the visible input.
        phone: normalizeSaudiPhone(rgPhone),
        password: rgPass,
      });
      setBackendSession(session);
      setRegisteredRole(session.role as AppRole);
      setCreatedName(rgName);
      setScreen("created");
    } catch (err) {
      setRgError(registerErrorKey(err));
    } finally {
      setRgStatus("idle");
    }
  }

  /**
   * Same discipline as `loginErrorKey` — existing `RGERR` keys only.
   *
   * A server `VALIDATION_ERROR` that names the password maps to the existing
   * `weak_password` banner rather than the generic `validation` one: the
   * Backend's `passwordSchema` also requires an upper-case letter, a lower-case
   * letter and a digit, which this form's own (frozen) client check does not
   * test for, so this is the one case where a field-level rule is only knowable
   * server-side. The client-side checks above are left exactly as they were —
   * tightening them would change the form's interaction sequence.
   */
  function registerErrorKey(err: unknown): string {
    if (!isApiError(err)) return "network";
    switch (err.errorCode) {
      case BackendErrorCode.EMAIL_ALREADY_EXISTS:
        return "email_exists";
      case BackendErrorCode.PHONE_ALREADY_EXISTS:
        return "phone_exists";
      case BackendErrorCode.TOO_MANY_REQUESTS:
        return "network";
      default:
        return /password/i.test(err.message) ? "weak_password" : "validation";
    }
  }

  function submitCompany(e: FormEvent) {
    e.preventDefault();
    if (!coName || !coCr || !vEmail(coEmail) || !coPhone || coCity === "اختر المدينة" || !coTerms) {
      setCoError("validation");
      return;
    }
    // AF-004 / D7: company self-registration isn't in the production design
    // yet — no `POST /companies` (or equivalent) endpoint exists. Real
    // fields are validated above so the interaction is honest, but nothing
    // is submitted.
    setCoError("not_available");
  }

  async function submitForgot() {
    if (!vEmail(fgEmail)) {
      setFgError("validation");
      return;
    }
    setFgStatus("loading");
    setFgError(null);
    try {
      // `POST /api/auth/forgot-password` — step one of the current two-step
      // reset. It always answers with a generic success and never reveals
      // whether the email exists, which is exactly what the "تحقّق من بريدك"
      // confirmation panel below already claims.
      await backendAuth.requestPasswordReset({ email: fgEmail.trim() });
      setFgStatus("sent");
    } catch {
      setFgError("network");
      setFgStatus("idle");
    }
  }

  function passwordStrength(pass: string): number {
    let n = 0;
    if (pass.length >= 8) n++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) n++;
    if (/\d/.test(pass)) n++;
    if (/[^A-Za-z0-9]/.test(pass)) n++;
    return pass ? n : 0;
  }

  async function submitReset() {
    if (rsPass.length < 8 || rsPass !== rsPass2) return;
    const token = resetToken;
    if (!token) return;
    setRsStatus("loading");
    try {
      // `POST /api/auth/reset-password` — step two. The Backend revokes every
      // refresh token for the account on success, so any other live session
      // ends too (SEC-006).
      await backendAuth.resetPassword({ token, newPassword: rsPass });
      setRsStatus("done");
    } catch {
      setRsStatus("idle");
    }
  }

  const liPassType = liShow ? "text" : "password";
  const rsPassType = rsShow ? "text" : "password";

  const STRENGTH_COLORS = ["var(--err)", "var(--err)", "var(--warn)", "var(--a-500)", "var(--ok)"];
  const STRENGTH_LABELS = ["", "ضعيفة", "متوسطة", "جيدة", "قوية"];
  const rsStrength = passwordStrength(rsPass);
  const rsStrengthColor = STRENGTH_COLORS[rsStrength] ?? "var(--t-tertiary)";
  const rsStrengthBars = [0, 1, 2, 3].map((i) => (i < rsStrength ? rsStrengthColor : "var(--n-surface2)"));
  const rsStrengthLabel = rsStrength ? `قوة كلمة المرور: ${STRENGTH_LABELS[rsStrength]}` : "أدخل كلمة المرور";

  return (
    <div dir="rtl" style={{ minHeight: "100dvh" }}>
      <div className="sk-shell" style={{ display: "grid", gridTemplateColumns: "44% 56%", minHeight: "100dvh" }}>
        {/* BRAND PANEL */}
        {/* Warm brand panel — same treatment as the landing hero (cream ground,
            soft gold glow, navy headline with a gold second line) rather than
            the flat navy slab it used to be, so auth reads as the same product
            as the landing page. Light ground also lets the logo stay the kit's
            own black artwork instead of a recoloured copy. */}
        <aside
          style={{
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(180deg, var(--n-surface) 0%, var(--n-bg) 55%, var(--n-bg2) 100%)",
            borderInlineEnd: "1px solid var(--n-border)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 48,
          }}
        >
          <div style={{ position: "absolute", inset: 0, opacity: 0.6 }}>
            <ImageSlotPlaceholder label="صورة معمارية" src="/projects/auth-community.jpg" />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(252,248,242,.55), rgba(246,239,232,.86))",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "-8%",
              right: "-6%",
              width: 360,
              height: 360,
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(var(--a-500-rgb), .22),transparent 70%)",
              filter: "blur(24px)",
              animation: "glow 9s var(--ease) infinite",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14 }}>
            <SukunLogo size={62} />
            <span style={{ width: 1, alignSelf: "stretch", margin: "8px 0", background: "var(--n-border-strong)" }} />
            <div style={{ color: "var(--a-700)", fontSize: 13, fontWeight: 600, letterSpacing: "-.1px" }}>
              بثقةٍ تُسكن
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <h2
              style={{
                color: "var(--t-primary)",
                fontSize: 38,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: "-.5px",
                margin: 0,
              }}
            >
              منصّة واحدة
              <br />
              <span style={{ color: "var(--a-500)" }}>لرحلة السكن بالكامل</span>
            </h2>
            <p
              style={{
                color: "var(--t-secondary)",
                fontSize: 16,
                lineHeight: 1.75,
                margin: "18px 0 0",
                maxWidth: 360,
              }}
            >
              من التسليم إلى ما بعد الضمان — انضم إلى المطوّرين والملّاك والمقاولين في منظومة ذكية واحدة.
            </p>
            <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
              {[
                ["+50", "مشروع"],
                ["+15K", "وحدة"],
                ["95%", "معدّل الإغلاق"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div style={{ color: "var(--t-primary)", fontSize: 26, fontWeight: 700 }}>{value}</div>
                  <div style={{ color: "var(--t-secondary)", fontSize: 12.5 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative", color: "var(--t-tertiary)", fontSize: 12.5 }}>
            © 2026 سكن · منصّة عقارية ذكية
          </div>
        </aside>

        {/* FORM PANEL */}
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "56px 40px",
            position: "relative",
            overflowY: "auto",
          }}
        >
          <div key={screen} style={{ width: "100%", maxWidth: 440, animation: "rein .35s var(--ease)" }}>
            {screen === "welcome" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", margin: "0 0 26px" }}>
                  <SukunLogo size={86} />
                </div>
                <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-.6px", margin: 0 }}>مرحباً بك في سكن</h1>
                <p style={{ fontSize: 17, color: "var(--t-secondary)", lineHeight: 1.75, margin: "16px 0 34px" }}>
                  ابدأ رحلتك نحو تجربة سكن ذكية وموثوقة — بثقةٍ تُسكن.
                </p>
                <button onClick={() => nav("journey")} style={primaryBtn}>
                  ابدأ رحلتك
                </button>
                <button
                  onClick={() => nav("login")}
                  style={{
                    width: "100%",
                    fontSize: 16,
                    fontWeight: 600,
                    padding: 15,
                    marginTop: 12,
                    border: "1.5px solid var(--a-400)",
                    borderRadius: "var(--r-md)",
                    background: "transparent",
                    color: "var(--a-700)",
                    cursor: "pointer",
                  }}
                >
                  تسجيل الدخول
                </button>
              </div>
            )}

            {screen === "journey" && (
              <div>
                <button onClick={() => nav("welcome")} style={backLinkStyle}>
                  <BackChevron /> العودة
                </button>
                <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0, textAlign: "center" }}>
                  كيف ترغب باستخدام سكن؟
                </h1>
                <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.7, margin: "12px 0 28px", textAlign: "center" }}>
                  اختر الرحلة التي تناسبك، ويمكنك استخدام جميع مزايا سكن لاحقاً من نفس الحساب.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <JourneyCard
                    title="أفراد"
                    desc="سواء كنت تبحث عن منزل، أو تملك وحدة سكنية."
                    icon={
                      <>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                      </>
                    }
                    onClick={() => nav("journeyInd", { journey: "individual" })}
                  />
                  <JourneyCard
                    title="مؤسسة عقارية"
                    desc="إدارة المشاريع، البلاغات، الصيانة، والفرق التنفيذية."
                    icon={
                      <>
                        <rect x="4" y="2" width="16" height="20" rx="2" />
                        <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" />
                      </>
                    }
                    onClick={() => nav("register", { journey: "enterprise" })}
                  />
                </div>
              </div>
            )}

            {screen === "journeyInd" && (
              <div>
                <button onClick={() => nav("journey")} style={backLinkStyle}>
                  <BackChevron /> العودة
                </button>
                <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0, textAlign: "center" }}>
                  ما الذي ترغب به اليوم؟
                </h1>
                <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.7, margin: "12px 0 28px", textAlign: "center" }}>
                  يمكنك التبديل بين الرحلتين لاحقاً — كلاهما ضمن نفس الحساب.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <IndividualCard
                    title="أبحث عن منزل"
                    desc="استكشف المشاريع، احصل على توصيات ذكية، وقارن واحجز الزيارات."
                    icon={
                      <>
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </>
                    }
                    onClick={() => nav("register", { journey: "individual", journeySub: "search" })}
                  />
                  <IndividualCard
                    title="لدي وحدة سكنية"
                    desc="أتابع الضمان، الصيانة، البلاغات، وإدارة وحدتي."
                    icon={<path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />}
                    onClick={() => nav("register", { journey: "individual", journeySub: "owner" })}
                  />
                </div>
                <p style={{ textAlign: "center", fontSize: 13, color: "var(--t-tertiary)", margin: "22px 0 0" }}>
                  لديك حساب بالفعل؟{" "}
                  <button onClick={() => nav("login")} style={{ fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                    سجّل الدخول
                  </button>
                </p>
              </div>
            )}

            {screen === "login" && (
              <>
                {liStatus === "done" ? (
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        width: 76,
                        height: 76,
                        margin: "0 auto 22px",
                        borderRadius: "50%",
                        background: "var(--ok-bg)",
                        color: "var(--ok)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        animation: "pop .5s var(--ease)",
                      }}
                    >
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>تم تسجيل الدخول</h1>
                    <p style={{ fontSize: 16, color: "var(--t-secondary)", lineHeight: 1.7, margin: "14px 0 28px" }}>
                      أهلاً بعودتك. نجهّز لك مساحة العمل الآن.
                    </p>
                    <button onClick={() => postAuthDestination(loggedInRole ?? "homeowner_prospect")} style={primaryBtn}>
                      المتابعة
                    </button>
                  </div>
                ) : (
                  <div>
                    <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>تسجيل الدخول</h1>
                    <p style={{ fontSize: 15, color: "var(--t-secondary)", margin: "10px 0 26px" }}>
                      أدخل بياناتك للوصول إلى حسابك في سكن.
                    </p>
                    {liError && <ErrorBanner err={LIERR[liError] ?? LIERR.validation} />}
                    <Field label="البريد الإلكتروني">
                      <input
                        type="text"
                        value={liEmail}
                        onChange={(e) => {
                          setLiEmail(e.target.value);
                          setLiError(null);
                        }}
                        placeholder="name@company.com"
                        dir="ltr"
                        style={{ ...(liError ? inputErrStyle : inputStyle), textAlign: "right" }}
                      />
                    </Field>
                    <label style={{ display: "block", marginBottom: 14 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, marginBottom: 7 }}>كلمة المرور</span>
                      <span style={{ position: "relative", display: "block" }}>
                        <input
                          type={liPassType}
                          value={liPass}
                          onChange={(e) => {
                            setLiPass(e.target.value);
                            setLiError(null);
                          }}
                          placeholder="••••••••"
                          style={{ ...(liError ? inputErrStyle : inputStyle), paddingLeft: 44 }}
                        />
                        <button
                          type="button"
                          onClick={() => setLiShow((v) => !v)}
                          aria-label="إظهار كلمة المرور"
                          style={{
                            position: "absolute",
                            left: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: 32,
                            height: 32,
                            border: "none",
                            background: "none",
                            color: "var(--t-tertiary)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <EyeIcon shown={liShow} />
                        </button>
                      </span>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                      {/* Was a bare `<span onClick>`: invisible to assistive
                          technology and unreachable by keyboard. Same pixels,
                          now a real checkbox — focusable, toggled by Space and
                          Enter, and announced with its state. */}
                      <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 14 }}>
                        <span
                          role="checkbox"
                          tabIndex={0}
                          aria-checked={liRemember}
                          aria-label="تذكّرني"
                          onClick={() => setLiRemember((v) => !v)}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              setLiRemember((v) => !v);
                            }
                          }}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "var(--r-sm)",
                            border: `1.5px solid ${liRemember ? "var(--g-700)" : "var(--n-border-strong)"}`,
                            background: liRemember ? "var(--g-700)" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flex: "none",
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-on-dark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: liRemember ? 1 : 0 }}>
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </span>
                        <span onClick={() => setLiRemember((v) => !v)}>تذكّرني</span>
                      </label>
                      <button onClick={() => nav("forgot")} style={{ fontSize: 14, fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                        نسيت كلمة المرور؟
                      </button>
                    </div>
                    <button onClick={() => void submitLogin()} disabled={liStatus === "loading"} style={{ ...primaryBtn, opacity: liStatus === "loading" ? 0.85 : 1 }}>
                      {liStatus === "loading" && <Spinner />}
                      {liStatus === "loading" ? "جارٍ الدخول…" : "تسجيل الدخول"}
                    </button>
                    <p style={{ textAlign: "center", fontSize: 14, color: "var(--t-secondary)", margin: "24px 0 0" }}>
                      ليس لديك حساب؟{" "}
                      <button onClick={() => nav("register", { journey: "individual" })} style={{ fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                        أنشئ حساباً
                      </button>
                    </p>
                  </div>
                )}
              </>
            )}

            {screen === "register" && journey !== "enterprise" && (
              <div>
                <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إنشاء حساب</h1>
                <p style={{ fontSize: 15, color: "var(--t-secondary)", margin: "10px 0 24px" }}>
                  أنشئ حسابك في دقائق وابدأ رحلتك مع سكن.
                </p>
                {rgError && <ErrorBanner err={RGERR[rgError] ?? RGERR.validation} />}
                {/* The National ID field that used to share this row is gone. It
                    was never sent to the Backend — `register` has no such field —
                    so it gated signup on a value nothing consumed. The row keeps
                    its own gap/margin and the name simply occupies it. */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginBottom: 14 }}>
                  <Field label="الاسم الكامل">
                    <input value={rgName} onChange={(e) => setRgName(e.target.value)} placeholder="محمد العتيبي" style={inputStyle} />
                  </Field>
                </div>
                <Field label="البريد الإلكتروني">
                  <input
                    type="email"
                    value={rgEmail}
                    onChange={(e) => setRgEmail(e.target.value)}
                    placeholder="name@company.com"
                    dir="ltr"
                    style={{ ...inputStyle, textAlign: "right" }}
                  />
                </Field>
                <Field label="رقم الجوال">
                  <input
                    value={rgPhone}
                    onChange={(e) => setRgPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="05XXXXXXXX"
                    dir="ltr"
                    style={{ ...inputStyle, textAlign: "right" }}
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                  <Field label="كلمة المرور">
                    <input type="password" value={rgPass} onChange={(e) => setRgPass(e.target.value)} placeholder="••••••••" style={inputStyle} />
                  </Field>
                  <Field label="تأكيد كلمة المرور">
                    <input
                      type="password"
                      value={rgPass2}
                      onChange={(e) => setRgPass2(e.target.value)}
                      placeholder="••••••••"
                      style={rgPass2 && rgPass !== rgPass2 ? inputErrStyle : inputStyle}
                    />
                  </Field>
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13.5, color: "var(--t-secondary)", lineHeight: 1.6, marginBottom: 22 }}>
                  <span
                    onClick={() => setRgTerms((v) => !v)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "var(--r-sm)",
                      border: `1.5px solid ${rgTerms ? "var(--g-700)" : "var(--n-border-strong)"}`,
                      background: rgTerms ? "var(--g-700)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      marginTop: 2,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-on-dark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: rgTerms ? 1 : 0 }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span onClick={() => setRgTerms((v) => !v)}>
                    أوافق على <a href="#">الشروط والأحكام</a> و<a href="#">سياسة الخصوصية</a>
                  </span>
                </label>
                <button onClick={() => void submitRegister()} disabled={rgStatus === "loading"} style={{ ...primaryBtn, opacity: rgStatus === "loading" ? 0.85 : 1 }}>
                  {rgStatus === "loading" && <Spinner />}
                  {rgStatus === "loading" ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
                </button>
                <p style={{ textAlign: "center", fontSize: 14, color: "var(--t-secondary)", margin: "22px 0 0" }}>
                  لديك حساب بالفعل؟{" "}
                  <button onClick={() => nav("login")} style={{ fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                    سجّل الدخول
                  </button>
                </p>
              </div>
            )}

            {screen === "register" && journey === "enterprise" && (
              <form onSubmit={submitCompany}>
                <button
                  type="button"
                  onClick={() => nav("journey")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  العودة
                </button>
                <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>إنشاء حساب المؤسسة</h1>
                <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.6, margin: "10px 0 24px" }}>
                  سجّل مؤسستك العقارية للانضمام إلى منظومة سكن. تُراجَع البيانات قبل التفعيل.
                </p>
                {coError && <ErrorBanner err={coError === "not_available" ? COMPANY_NOT_AVAILABLE : RGERR.validation} />}
                <Field label="اسم المؤسسة العقارية">
                  <input value={coName} onChange={(e) => setCoName(e.target.value)} placeholder="مثال: شركة أوج للتطوير العقاري" style={inputStyle} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <Field label="رقم السجل التجاري">
                    <input value={coCr} onChange={(e) => setCoCr(e.target.value)} inputMode="numeric" placeholder="10XXXXXXXX" dir="ltr" style={{ ...inputStyle, textAlign: "right" }} />
                  </Field>
                  <Field label="المدينة الرئيسية">
                    <select value={coCity} onChange={(e) => setCoCity(e.target.value)} style={inputStyle}>
                      {["اختر المدينة", "الرياض", "جدة", "الدمام", "مكة المكرمة", "المدينة المنورة", "الخبر"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="البريد الإلكتروني الرسمي">
                  <input type="email" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} placeholder="info@company.com" dir="ltr" style={{ ...inputStyle, textAlign: "right" }} />
                </Field>
                <Field label="رقم الجوال">
                  <input value={coPhone} onChange={(e) => setCoPhone(e.target.value)} inputMode="tel" placeholder="05XXXXXXXX" dir="ltr" style={{ ...inputStyle, textAlign: "right" }} />
                </Field>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13.5, color: "var(--t-secondary)", lineHeight: 1.6, marginBottom: 22 }}>
                  <span
                    onClick={() => setCoTerms((v) => !v)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "var(--r-sm)",
                      border: `1.5px solid ${coTerms ? "var(--g-700)" : "var(--n-border-strong)"}`,
                      background: coTerms ? "var(--g-700)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      marginTop: 2,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-on-dark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: coTerms ? 1 : 0 }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span onClick={() => setCoTerms((v) => !v)}>
                    أوافق على <a href="#">الشروط والأحكام</a> و<a href="#">سياسة الخصوصية</a>
                  </span>
                </label>
                <button type="submit" style={primaryBtn}>
                  إنشاء حساب المؤسسة
                </button>
                <p style={{ textAlign: "center", fontSize: 14, color: "var(--t-secondary)", margin: "22px 0 0" }}>
                  لديك حساب مؤسسة بالفعل؟{" "}
                  <button type="button" onClick={() => nav("login")} style={{ fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                    سجّل الدخول
                  </button>
                </p>
              </form>
            )}

            {screen === "forgot" && (
              <>
                {fgStatus === "sent" ? (
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        margin: "0 auto 22px",
                        borderRadius: "50%",
                        background: "var(--ok-bg)",
                        color: "var(--ok)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        animation: "pop .5s var(--ease)",
                      }}
                    >
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
                      </svg>
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>تحقّق من بريدك</h1>
                    <p style={{ fontSize: 16, color: "var(--t-secondary)", lineHeight: 1.75, margin: "14px 0 28px" }}>
                      إذا كان البريد <span dir="ltr" style={{ fontWeight: 600, color: "var(--t-primary)" }}>{fgEmail}</span> مسجّلاً لدينا، ستصلك رسالة تحتوي رابط إعادة تعيين كلمة المرور.
                    </p>
                    <button onClick={() => nav("login")} style={{ fontSize: 14, fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                      العودة لتسجيل الدخول
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => nav("login")}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                      العودة
                    </button>
                    <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>نسيت كلمة المرور؟</h1>
                    <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.7, margin: "10px 0 26px" }}>
                      أدخل بريدك وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
                    </p>
                    {fgError && (
                      <div style={{ display: "flex", gap: 11, padding: "13px 15px", background: "var(--err-bg)", border: "1px solid rgba(188,70,48,.3)", borderRadius: "var(--r-md)", marginBottom: 20 }}>
                        <span style={{ color: "var(--err)", flex: "none" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4M12 16h.01" />
                          </svg>
                        </span>
                        <div style={{ fontSize: 13.5, color: "var(--err-strong)", fontWeight: 500 }}>
                          {fgError === "network" ? "تعذّر الاتصال بالخادم. حاول مجدداً." : "أدخل بريداً إلكترونياً صحيحاً."}
                        </div>
                      </div>
                    )}
                    <Field label="البريد الإلكتروني">
                      <input
                        type="email"
                        value={fgEmail}
                        onChange={(e) => setFgEmail(e.target.value)}
                        placeholder="name@company.com"
                        dir="ltr"
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                    </Field>
                    <button onClick={() => void submitForgot()} disabled={fgStatus === "loading"} style={{ ...primaryBtn, opacity: fgStatus === "loading" ? 0.85 : 1 }}>
                      {fgStatus === "loading" && <Spinner />}
                      {fgStatus === "loading" ? "جارٍ الإرسال…" : "إرسال الرابط"}
                    </button>
                  </div>
                )}
              </>
            )}

            {screen === "reset" && (
              <>
                {rsStatus === "done" ? (
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        margin: "0 auto 22px",
                        borderRadius: "50%",
                        background: "var(--ok-bg)",
                        color: "var(--ok)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        animation: "pop .5s var(--ease)",
                      }}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>تم تحديث كلمة المرور</h1>
                    <p style={{ fontSize: 16, color: "var(--t-secondary)", lineHeight: 1.7, margin: "14px 0 28px" }}>
                      يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
                    </p>
                    <button onClick={() => nav("login")} style={primaryBtn}>
                      تسجيل الدخول
                    </button>
                  </div>
                ) : (
                  resetToken === null ? (
                  /**
                   * No `?token=` in the URL.
                   *
                   * The form used to render regardless, so `/reset-password`
                   * opened as a working password form that could never
                   * succeed: `submitReset` returns early with no token, so
                   * pressing the button did nothing at all and said nothing.
                   * The honest state is that the link is missing or invalid,
                   * with the one action that can actually help.
                   */
                  <div>
                    <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>رابط غير صالح</h1>
                    <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.7, margin: "10px 0 24px" }}>
                      رابط إعادة تعيين كلمة المرور غير مكتمل أو انتهت صلاحيته. اطلب رابطاً جديداً وسنرسله إلى بريدك.
                    </p>
                    <button onClick={() => nav("forgot")} style={primaryBtn}>
                      طلب رابط جديد
                    </button>
                    <div style={{ fontSize: 14, color: "var(--t-secondary)", marginTop: 22 }}>
                      <button onClick={() => nav("login")} style={{ fontWeight: 600, color: "var(--a-700)", background: "none", border: "none", cursor: "pointer" }}>
                        العودة لتسجيل الدخول
                      </button>
                    </div>
                  </div>
                  ) : (
                  <div>
                    <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>كلمة مرور جديدة</h1>
                    <p style={{ fontSize: 15, color: "var(--t-secondary)", lineHeight: 1.7, margin: "10px 0 24px" }}>
                      اختر كلمة مرور قوية لحماية حسابك.
                    </p>
                    <label style={{ display: "block", marginBottom: 14 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, marginBottom: 7 }}>كلمة المرور الجديدة</span>
                      <span style={{ position: "relative", display: "block" }}>
                        <input
                          type={rsPassType}
                          value={rsPass}
                          onChange={(e) => setRsPass(e.target.value)}
                          placeholder="••••••••"
                          style={{ ...inputStyle, paddingLeft: 44 }}
                        />
                        <button
                          type="button"
                          onClick={() => setRsShow((v) => !v)}
                          aria-label="إظهار"
                          style={{
                            position: "absolute",
                            left: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: 32,
                            height: 32,
                            border: "none",
                            background: "none",
                            color: "var(--t-tertiary)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <EyeIcon shown={rsShow} />
                        </button>
                      </span>
                    </label>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {rsStrengthBars.map((color, i) => (
                        <span key={i} style={{ flex: 1, height: 5, borderRadius: "var(--r-full)", background: color }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 12.5, color: rsStrengthColor, fontWeight: 600, marginBottom: 18 }}>{rsStrengthLabel}</div>
                    <Field label="تأكيد كلمة المرور">
                      <input
                        type="password"
                        value={rsPass2}
                        onChange={(e) => setRsPass2(e.target.value)}
                        placeholder="••••••••"
                        style={rsPass2 && rsPass !== rsPass2 ? inputErrStyle : inputStyle}
                      />
                    </Field>
                    <button onClick={() => void submitReset()} disabled={rsStatus === "loading"} style={{ ...primaryBtn, opacity: rsStatus === "loading" ? 0.85 : 1, marginTop: 8 }}>
                      {rsStatus === "loading" && <Spinner />}
                      {rsStatus === "loading" ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
                    </button>
                  </div>
                  )
                )}
              </>
            )}

            {screen === "created" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 26px" }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      background: "radial-gradient(circle,rgba(47,158,106,.22),transparent 70%)",
                      animation: "glow 4s var(--ease) infinite",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 18,
                      borderRadius: "50%",
                      background: "var(--ok)",
                      color: "var(--t-on-dark)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      animation: "pop .55s var(--ease)",
                      boxShadow: "0 12px 30px rgba(47,158,106,.35)",
                    }}
                  >
                    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                </div>
                <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-.4px", margin: 0 }}>تم إنشاء حسابك بنجاح</h1>
                <p style={{ fontSize: 17, color: "var(--t-secondary)", lineHeight: 1.75, margin: "16px 0 32px" }}>
                  أهلاً بك في سكن، <span style={{ fontWeight: 600, color: "var(--t-primary)" }}>{createdName}</span>. كل شيء جاهز لتبدأ رحلتك.
                </p>
                <button
                  onClick={() => postAuthDestination(registeredRole ?? "homeowner_prospect")}
                  style={primaryBtn}
                >
                  المتابعة
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
