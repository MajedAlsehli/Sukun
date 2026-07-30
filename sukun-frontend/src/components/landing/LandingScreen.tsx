"use client";

/**
 * H1 · الصفحة الرئيسية (Landing) — ported from the SUKUN (سُكن) rebrand
 * export (`Sakn Landing (standalone)-3.html`'s embedded `__bundler/template`
 * payload, decoded — the standalone bundle is a compiled runtime wrapper
 * around the exact same design-tool template format as every `.dc.html`
 * file; its `<script type="text/x-dc">` block and `:root` token set are the
 * real source, just base64/JSON-wrapped). Supersedes the earlier green/
 * bronze "Sakn" port — markup/copy/inline-styles/animations are
 * pixel-for-pixel from that decoded template, per the same rule
 * `04_Screen_Specifications/H1_Landing.md` already established.
 *
 * Structural differences from the previous "Sakn" version, confirmed by
 * diffing the decoded template against the prior `Sakn Landing.dc.html`
 * (not assumed): the Hero drops its secondary "اكتشف المنتج" button (one
 * CTA only), the old two-section "PRODUCT PREVIEW" (dashboard mockup) +
 * "PLATFORM OVERVIEW" (3-column card grid) are both replaced by a single
 * "PLATFORM OVERVIEW" icon strip (`sk-capstrip`), and the "JOURNEY
 * TIMELINE" section is removed entirely. WHO/AI CAPABILITIES/STATS/
 * TESTIMONIALS/FAQ/FOOTER are structurally unchanged (copy identical).
 *
 * Same two literal-file deviations as before, for the same reason (this
 * screen's own spec, `H1_Landing.md`'s Buttons table: "→ H2 Auth", and
 * `02_Navigation_Map.md` §2): the nav/mobile-drawer CTA and the hero
 * primary CTA go to `/signup` instead of the decoded template's literal
 * `href="#resources"` (a same-page anchor in the source, since it's a
 * self-contained demo with no real inter-page routing).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SukunLogo } from "@/components/brand/SukunLogo";
import { Reveal } from "./Reveal";
import { Counter } from "./Counter";

function Icon({
  children,
  size,
  strokeWidth = 1.8,
}: {
  children: ReactNode;
  size: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The SUKUN arch mark — 3 nested door/arch strokes + a 3-dot diagonal accent (g-900/g-700/a-500). Replaces the old Sakn mark (a single arch path + 4 loose a-500 dots). */
const NAV_LINKS = [
  { name: "المنتج", href: "#platform" },
  { name: "المميزات", href: "#platform" },
  { name: "الأسعار", href: "#resources" },
  { name: "الموارد", href: "#resources" },
  { name: "عن سكن", href: "#who" },
];

type WhoId = "company" | "beneficiary";
const WHO_DEFS: {
  id: WhoId;
  title: string;
  icon: ReactNode;
  points: string[];
}[] = [
  {
    id: "company",
    title: "الشركة العقارية",
    icon: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" />
      </>
    ),
    points: ["إدارة المشاريع", "إدارة الوحدات", "متابعة الإصلاحات", "تقارير تنفيذية", "مؤشرات الأداء"],
  },
  {
    id: "beneficiary",
    title: "المستفيد",
    icon: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    points: ["البحث عن السكن", "حجز الزيارة", "رفع الملاحظات", "متابعة الضمان", "اتحاد الملّاك"],
  },
];

/** `capOrder = [0,1,4,3,2,5]` in the source — capabilities render in this order, not declaration order. */
const CAPABILITIES: { title: string; icon: ReactNode }[] = [
  {
    title: "البحث عن السكن",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
        <path d="m8 11 2 2 4-4" />
      </>
    ),
  },
  {
    title: "حجز الزيارة",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 15h3" />
      </>
    ),
  },
  {
    title: "تقييم الزيارة",
    icon: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: "الضمان والصيانة",
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    title: "متابعة الإصلاح",
    icon: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" />,
  },
  {
    title: "اتحاد الملّاك",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
];

const AI_CARDS = [
  {
    title: "التحقّق من الإصلاح",
    en: "AI Repair Validation",
    desc: "تأكّد من جودة الإصلاح والتحقّق من المطابقة تلقائياً قبل الإغلاق.",
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    title: "اكتشاف العيوب",
    en: "AI Defect Detection",
    desc: "يكشف ويصنّف العيوب بدقّة عالية من أوّل الصور المرفوعة.",
    icon: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: "التوصية الذكية",
    en: "Smart Recommendation",
    desc: "يقترح أفضل المشاريع والوحدات المناسبة لكل مستفيد.",
    icon: (
      <>
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" />
        <path d="M5 20h5M18 18v4" />
      </>
    ),
  },
  {
    title: "مساعد المشاريع",
    en: "AI Project Copilot",
    desc: "مساعد ذكي للإجابة عن الأسئلة واتخاذ القرارات بسرعة.",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4M8 16h.01M16 16h.01" />
      </>
    ),
  },
  {
    title: "رؤى تنفيذية",
    en: "Executive Insights",
    desc: "تحليل أداء المشاريع والفرق ومؤشّرات الجودة للقيادة.",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </>
    ),
  },
  {
    title: "ذكاء الضمان",
    en: "Warranty Intelligence",
    desc: "التحليل الذكي حتى انتهاء الضمان مع تنبيهات استباقية.",
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M12 8v4l2 2" />
      </>
    ),
  },
].map((c, i) => ({ ...c, delay: `${(i % 3) * 0.08}s` }));

const STATS: { pre: string; value: number; suf: string; label: string }[] = [
  { pre: "+", value: 50, suf: "", label: "مشروع مُدار" },
  { pre: "+", value: 15, suf: "K", label: "وحدة سكنية" },
  { pre: "+", value: 80, suf: "", label: "مقاول معتمد" },
  { pre: "+", value: 120, suf: "K", label: "بلاغ تمت معالجته" },
  { pre: "", value: 95, suf: "%", label: "معدّل إغلاق البلاغات" },
];

const TESTIMONIALS = [
  {
    quote: "غيّرت سكن طريقة إدارتنا لما بعد التسليم بالكامل. رضا الملّاك ارتفع بشكل ملحوظ خلال أشهر.",
    name: "م. خالد العتيبي",
    role: "مدير التطوير · شركة معمار",
    avBg: "var(--g-700)",
    av: "خ",
  },
  {
    quote: "التحقّق الذكي من الإصلاح وفّر علينا ساعات من المعاينة اليدوية، والدقّة مذهلة.",
    name: "نورة الفهد",
    role: "مديرة العمليات · دار السكن",
    avBg: "var(--a-600)",
    av: "ن",
  },
  {
    quote: "أخيراً منصّة واحدة تجمع المطوّر والمقاول والمالك. تجربة مؤسسية بمعنى الكلمة.",
    name: "عبدالله الشمري",
    role: "الرئيس التنفيذي · عقارات المستقبل",
    avBg: "var(--g-500)",
    av: "ع",
  },
].map((t, i) => ({ ...t, delay: `${i * 0.1}s` }));

const FAQS = [
  {
    q: "ما هي منصّة سكن؟",
    a: "سكن منصّة عقارية ذكية تُوحّد رحلة ما بعد التسليم — من الفحص والصيانة إلى الضمان — للمطوّرين والملّاك والمقاولين في نظامٍ واحد متكامل.",
  },
  {
    q: "كيف يعمل التحقّق الذكي من الإصلاح؟",
    a: "يستخدم الذكاء الاصطناعي تحليل الصور والبيانات للتأكّد من جودة الإصلاح ومطابقته للمعايير تلقائياً قبل إغلاق البلاغ.",
  },
  {
    q: "هل تدعم المنصّة اللغة العربية بالكامل؟",
    a: "نعم، سكن مبنيّة بالعربية أولاً مع دعم كامل للاتجاه من اليمين لليسار، وتوفّر تجربة إنجليزية موازية.",
  },
  {
    q: "هل يمكن دمج سكن مع أنظمتنا الحالية؟",
    a: "تتكامل سكن مع أنظمة إدارة المشاريع والعقارات الشائعة عبر واجهات برمجية آمنة، ويدعم فريقنا عملية الربط بالكامل.",
  },
  {
    q: "كيف أبدأ؟",
    a: "ابدأ رحلتك مخصّصاً، وسيقوم فريقنا بإعداد بيئة تجريبية تعكس مشاريعك الفعلية خلال أيام.",
  },
].map((f, i) => ({ ...f, delay: `${i * 0.06}s` }));

const SOCIALS: { name: string; icon: ReactNode }[] = [
  { name: "X", icon: <path d="M4 4l16 16M20 4L4 20" /> },
  {
    name: "LinkedIn",
    icon: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="3" />
        <path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4" />
      </>
    ),
  },
  {
    name: "Instagram",
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17 7v.01" />
      </>
    ),
  },
  {
    name: "YouTube",
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="4" />
        <path d="m10 9 5 3-5 3z" />
      </>
    ),
  },
];

const FOOT_COLS = [
  { title: "المنتج", links: ["المميزات", "القدرات الذكية", "لوحة التحكّم", "الأسعار"] },
  { title: "الشركة", links: ["عن سكن", "الموارد", "المدوّنة", "الوظائف"] },
  { title: "الدعم", links: ["مركز المساعدة", "تواصل معنا", "حالة النظام", "الوثائق"] },
];

const primaryPillBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  fontSize: 16,
  fontWeight: 600,
  padding: "15px 28px",
  borderRadius: "var(--r-md)",
  background: "var(--g-900)",
  color: "var(--t-on-dark)",
  boxShadow: "var(--sh-2)",
  transition: "transform .22s var(--ease), box-shadow .22s var(--ease)",
};

export function LandingScreen() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lang, setLang] = useState<"EN" | "ع">("EN");
  const [whoActive, setWhoActive] = useState<WhoId>("company");
  const [statsIn, setStatsIn] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const statsSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStatsIn(true);
      return;
    }
    const statsEl = statsSectionRef.current;
    if (!statsEl) return;
    const so = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStatsIn(true);
          so.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    so.observe(statsEl);
    return () => so.disconnect();
  }, []);

  const navBg = scrolled ? "rgba(246,239,232,.82)" : "rgba(246,239,232,0)";
  const navBorder = scrolled ? "var(--n-border)" : "transparent";
  const navShadow = scrolled ? "var(--sh-1)" : "none";
  const navPad = scrolled ? "12px" : "18px";

  // `overflow-x: hidden` used to sit on the root below. It did not fit
  // anything — it HID the overflow, so `document.scrollWidth` looked correct
  // while the "من يستخدم سُكن؟" cards, the AI cards' English captions and the
  // footer columns sat off-screen on an iPhone with no way to reach them. The
  // real causes (fixed-count grids that cannot fit 390px) are corrected in
  // globals.css under `.sk-who` / `.sk-grid3` / `.sk-capstrip` / `.sk-stats` /
  // `.sk-foot`, so nothing needs hiding.
  return (
    <div dir="rtl" className="sk-root">
      <style>{`
        .sk-root .sk-whocard:hover .sk-whoicon{transform:scale(1.05)}
        .sk-root .sk-whocard:focus-visible{outline:2px solid var(--a-500);outline-offset:3px}
        .sk-root .sk-cap:hover .sk-capicon{transform:scale(1.05)}
        .sk-root .sk-cap:hover .sk-captitle{color:var(--a-600)}
        @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes glowPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.85;transform:scale(1.08)}}
        @media (max-width:1040px){
          .sk-root .sk-grid3{grid-template-columns:repeat(2,1fr)}
          .sk-root .sk-who{grid-template-columns:1fr}
          .sk-root .sk-capstrip{grid-template-columns:repeat(3,1fr)!important}
          .sk-root .sk-capline{display:none}
        }
        @media (max-width:820px){
          .sk-root .sk-nav{display:none!important}
          .sk-root .sk-burger{display:flex!important}
          .sk-root .sk-stats{grid-template-columns:repeat(2,1fr);row-gap:40px}
          .sk-root .sk-foot{grid-template-columns:1fr 1fr}
          .sk-root .sk-hero h1{font-size:56px!important}
        }
        @media (max-width:600px){
          .sk-root .sk-grid3{grid-template-columns:1fr}
          .sk-root .sk-capstrip{grid-template-columns:repeat(2,1fr)!important}
          .sk-root .sk-foot{grid-template-columns:1fr}
          .sk-root .sk-hero h1{font-size:44px!important}
          .sk-root section h2{font-size:34px!important}
        }
      `}</style>

      {/* NAV */}
      <header
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          left: 0,
          zIndex: 80,
          transition: "all .35s var(--ease)",
          background: navBg,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${navBorder}`,
          boxShadow: navShadow,
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: `${navPad} 40px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "padding .35s var(--ease)",
          }}
        >
          <a href="#top" aria-label="سُكن" style={{ display: "flex", alignItems: "center", padding: "2px 4px" }}>
            <SukunLogo size={46} />
          </a>
          <nav className="sk-nav" style={{ display: "flex", gap: 2, fontSize: 14.5, fontWeight: 500 }}>
            {NAV_LINKS.map((l, i) => (
              <a
                key={`${l.href}-${i}`}
                href={l.href}
                style={{
                  padding: "9px 15px",
                  borderRadius: "var(--r-full)",
                  color: "var(--t-secondary)",
                }}
              >
                {l.name}
              </a>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* The label flipped EN/ع and nothing else happened: this product
                ships in Arabic only, so the control promised a translation
                that does not exist. It now says so — same pill, same place,
                honestly disabled — rather than looking like a working switch
                with an empty handler. */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="النسخة الإنجليزية غير متاحة حالياً"
              aria-label="اللغة: العربية — النسخة الإنجليزية غير متاحة حالياً"
              style={{
                opacity: 0.55,
                cursor: "not-allowed",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--t-secondary)",
                background: "transparent",
                border: "1px solid var(--n-border-strong)",
                padding: "8px 14px",
                borderRadius: "var(--r-full)",
              }}
            >
              <Icon size={15}>
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
              </Icon>
              {lang}
            </button>
            <a href="/signup" style={{ fontSize: 14.5, fontWeight: 600, padding: "10px 20px", borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", boxShadow: "var(--sh-1)" }}>
              ابدأ رحلتك
            </a>
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="القائمة"
              className="sk-burger"
              style={{
                fontFamily: "inherit",
                display: "none",
                width: 42,
                height: 42,
                border: "1px solid var(--n-border-strong)",
                borderRadius: "var(--r-md)",
                background: "var(--n-surface)",
                cursor: "pointer",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={20} strokeWidth={2}>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </Icon>
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE NAV */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(13,27,52,.45)", backdropFilter: "blur(3px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: 280,
              background: "var(--n-surface)",
              boxShadow: "var(--sh-4)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <SukunLogo size={46} />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="إغلاق"
                style={{ fontFamily: "inherit", width: 34, height: 34, border: "none", background: "var(--n-surface2)", borderRadius: "var(--r-sm)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            {NAV_LINKS.map((l, i) => (
              <a
                key={`${l.href}-${i}`}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                style={{ padding: "13px 12px", borderRadius: "var(--r-md)", color: "var(--t-primary)", fontSize: 16, fontWeight: 500 }}
              >
                {l.name}
              </a>
            ))}
            <a
              href="/signup"
              onClick={() => setMobileOpen(false)}
              style={{ marginTop: 12, textAlign: "center", padding: 13, borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--t-on-dark)", fontWeight: 600 }}
            >
              ابدأ رحلتك
            </a>
          </div>
        </div>
      )}

      {/* HERO */}
      <section id="top" className="sk-hero" style={{ position: "relative", minHeight: "100dvh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        {/* Production hero photo, extracted from the SUKUN export's own
            bundler resource manifest (`Sakn Landing (standalone)-3.html`,
            asset id e787c208-1424-4494-89ec-b0f7ec51b2b8) — the floating
            circular feature icons (search/calendar/camera/shield/document)
            are baked into this asset itself, not separate DOM elements.
            Fixed-width left panel (not full-bleed) so it can never collapse
            to 0 regardless of viewport width; object-position keeps the
            house anchored left as the box crops its own already-faded
            right tail. */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "48%", minWidth: 480, zIndex: 0 }}>
          <img
            src="/hero-architecture.png"
            alt=""
            aria-hidden="true"
            width={2024}
            height={1467}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left center", display: "block" }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background:
              "linear-gradient(to left, rgba(246,239,232,.92) 0%, rgba(246,239,232,.72) 20%, rgba(246,239,232,.3) 42%, rgba(246,239,232,.05) 66%, rgba(246,239,232,0) 100%)," +
              "linear-gradient(to bottom, rgba(246,239,232,.9) 0%, rgba(246,239,232,0) 14%)," +
              "linear-gradient(to top, rgba(246,239,232,.95) 0%, rgba(246,239,232,0) 16%)," +
              "linear-gradient(to right, rgba(246,239,232,.9) 0%, rgba(246,239,232,0) 10%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "14%",
            left: "8%",
            zIndex: 1,
            width: 340,
            height: 340,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(var(--a-500-rgb), .22), transparent 70%)",
            filter: "blur(20px)",
            animation: "glowPulse 8s var(--ease) infinite",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 1240, margin: "0 auto", padding: "120px 40px 60px", width: "100%" }}>
          <div style={{ maxWidth: 620, marginRight: 0, marginLeft: "auto" }}>
            <h1 style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.32, letterSpacing: 0, margin: 0 }}>
              سّكن…
              <br />
              <span style={{ color: "var(--a-500)" }}>بثقةٍ تُسكن</span>
            </h1>
            <p style={{ fontSize: 21, color: "var(--t-secondary)", lineHeight: 1.7, maxWidth: 540, margin: "22px 0 0" }}>
              من التسليم إلى ما بعد الضمان — منصّة ذكية تُوحّد عمليات المطوّرين، وترتقي بتجربة الملّاك والمستفيدين في نظامٍ واحد متكامل.
            </p>
            <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
              <a href="/signup" style={primaryPillBtn}>
                ابدأ رحلتك
                <Icon size={18} strokeWidth={2}>
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </Icon>
              </a>
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 26,
            right: "50%",
            transform: "translateX(50%)",
            zIndex: 2,
            color: "var(--t-tertiary)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
          }}
        >
          مرّر للأسفل
          <Icon size={18} strokeWidth={2}>
            <g style={{ animation: "floaty 2.2s var(--ease) infinite" }}>
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </g>
          </Icon>
        </div>
      </section>

      {/* WHO USES SUKUN */}
      <section id="who" style={{ background: "var(--n-bg2)", borderTop: "1px solid var(--n-border)", borderBottom: "1px solid var(--n-border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "104px 40px" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)", letterSpacing: ".5px", marginBottom: 14 }}>
              طرفان في منصّة واحدة
            </div>
            <h2 style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-.8px", margin: 0, lineHeight: 1.1 }}>من يستخدم سُكن؟</h2>
          </Reveal>
          <div dir="ltr" className="sk-who" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "stretch" }}>
            {WHO_DEFS.map((c) => {
              const on = c.id === whoActive;
              return (
                <div
                  key={c.id}
                  dir="rtl"
                  className="sk-whocard"
                  onClick={() => setWhoActive(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setWhoActive(c.id);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 460,
                    background: on ? "var(--g-900)" : "var(--n-surface)",
                    border: `1.5px solid ${on ? "var(--g-900)" : "var(--a-300)"}`,
                    borderRadius: "var(--r-2xl)",
                    boxShadow: on ? "var(--sh-3)" : "var(--sh-2)",
                    padding: 48,
                    cursor: "pointer",
                    transition: "transform .25s var(--ease),box-shadow .25s var(--ease),background .25s var(--ease),border-color .25s var(--ease)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
                    <h3 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: on ? "var(--t-on-dark)" : "var(--t-primary)" }}>{c.title}</h3>
                    <span
                      className="sk-whoicon"
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "var(--r-md)",
                        background: on ? "rgba(243,236,226,.1)" : "var(--a-50)",
                        color: on ? "var(--a-300)" : "var(--g-700)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                        transition: "transform .25s var(--ease)",
                      }}
                    >
                      <Icon size={27}>{c.icon}</Icon>
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    {c.points.map((p) => (
                      <div key={p} style={{ display: "flex", alignItems: "center", gap: 13 }}>
                        <span style={{ fontSize: 17, color: on ? "var(--t-on-dark)" : "var(--t-primary)" }}>{p}</span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? "var(--a-400)" : "var(--a-500)", flex: "none" }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI CAPABILITIES */}
      <section id="ai" style={{ maxWidth: 1240, margin: "0 auto", padding: "104px 40px" }}>
        <Reveal style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 56px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--a-700)", letterSpacing: ".5px", marginBottom: 14 }}>
            <Icon size={16} strokeWidth={1.9}>
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" />
            </Icon>
            مدعومة بالذكاء الاصطناعي
          </div>
          <h2 style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-.8px", margin: 0, lineHeight: 1.1 }}>قدرات سكن الذكية</h2>
          <p style={{ fontSize: 18, color: "var(--t-secondary)", lineHeight: 1.7, margin: "18px 0 0" }}>
            ذكاء اصطناعي يعمل في الخلفية لاكتشاف العيوب، التحقّق من الإصلاح، ودعم القرار.
          </p>
        </Reveal>
        <div className="sk-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {AI_CARDS.map((c) => (
            <Reveal
              key={c.title}
              duration={0.6}
              delay={c.delay}
              style={{
                position: "relative",
                background: "linear-gradient(160deg,var(--n-surface),var(--a-50))",
                border: "1px solid var(--n-border)",
                borderRadius: "var(--r-xl)",
                padding: 30,
                overflow: "hidden",
              }}
            >
              <div style={{ position: "absolute", top: -30, left: -30, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle,rgba(var(--a-500-rgb), .14),transparent 70%)" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ width: 50, height: 50, borderRadius: "var(--r-md)", background: "var(--g-900)", color: "var(--a-300)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={25} strokeWidth={1.7}>
                    {c.icon}
                  </Icon>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--a-700)", background: "var(--a-100)", padding: "4px 10px", borderRadius: "var(--r-full)" }}>{c.en}</span>
              </div>
              <h3 style={{ position: "relative", fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>{c.title}</h3>
              <p style={{ position: "relative", fontSize: 14.5, color: "var(--t-secondary)", lineHeight: 1.7, margin: 0 }}>{c.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PLATFORM OVERVIEW — icon strip (replaces the old card-grid + dashboard-mockup sections) */}
      <section id="platform" style={{ maxWidth: 1240, margin: "0 auto", padding: "136px 40px" }}>
        <Reveal style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 56px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)", letterSpacing: ".5px", marginBottom: 14 }}>منصّة واحدة · قدرات متكاملة</div>
          <h2 style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-.8px", margin: 0, lineHeight: 1.1 }}>قدرات منصّة سكن</h2>
          <p style={{ fontSize: 18, color: "var(--t-secondary)", lineHeight: 1.7, margin: "16px 0 0" }}>كل ما تحتاجه داخل منصّة واحدة.</p>
        </Reveal>
        <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto" }}>
          <div
            className="sk-capline"
            style={{
              position: "absolute",
              top: 26,
              right: "8.33%",
              left: "8.33%",
              height: 1,
              background: "linear-gradient(90deg,rgba(200,154,91,0),rgba(200,154,91,.5) 10%,rgba(200,154,91,.5) 90%,rgba(200,154,91,0))",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
          <div className="sk-capstrip" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(6,1fr)", columnGap: 14, rowGap: 56 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="sk-cap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, cursor: "default" }}>
                <span
                  className="sk-capicon"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "var(--r-md)",
                    background: "var(--g-50)",
                    color: "var(--g-600)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                    transition: "transform .25s var(--ease)",
                  }}
                >
                  <Icon size={27} strokeWidth={1.7}>
                    {c.icon}
                  </Icon>
                </span>
                <h3 className="sk-captitle" style={{ fontSize: 16, fontWeight: 600, margin: 0, textAlign: "center", lineHeight: 1.5, transition: "color .25s var(--ease)" }}>
                  {c.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section ref={statsSectionRef} id="stats" style={{ background: "var(--g-900)", color: "var(--t-on-dark)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "76px 40px" }}>
          <div className="sk-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 24, textAlign: "center" }}>
            {STATS.map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, letterSpacing: "-1px", color: "var(--t-on-dark)", display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2 }}>
                  <span style={{ color: "var(--a-300)" }}>{s.pre}</span>
                  <Counter target={s.value} suffix={s.suf} active={statsIn} />
                </div>
                <div style={{ fontSize: 14.5, color: "var(--t-on-dark-soft)", marginTop: 12 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" style={{ maxWidth: 1240, margin: "0 auto", padding: "104px 40px" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)", letterSpacing: ".5px", marginBottom: 14 }}>موثوقة من كبار المطوّرين</div>
          <h2 style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-.8px", margin: 0, lineHeight: 1.1 }}>صوت عملائنا</h2>
        </Reveal>
        <div className="sk-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {TESTIMONIALS.map((t) => (
            <Reveal
              key={t.name}
              duration={0.6}
              delay={t.delay}
              style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-xl)", padding: 32, display: "flex", flexDirection: "column" }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="var(--a-200)" style={{ marginBottom: 18 }} aria-hidden="true">
                <path d="M9.5 6C6.5 7 5 9.5 5 13v5h6v-6H8c0-2.5 1-4 3-4.5zM19.5 6c-3 1-4.5 3.5-4.5 7v5h6v-6h-3c0-2.5 1-4 3-4.5z" />
              </svg>
              <p style={{ fontSize: 16, lineHeight: 1.8, color: "var(--t-primary)", margin: "0 0 24px", flex: 1 }}>{t.quote}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                <span style={{ width: 46, height: 46, borderRadius: "50%", background: t.avBg, color: "var(--t-on-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, flex: "none" }}>
                  {t.av}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: "var(--t-tertiary)" }}>{t.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="resources" style={{ background: "var(--n-bg2)", borderTop: "1px solid var(--n-border)", borderBottom: "1px solid var(--n-border)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "104px 40px" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--a-700)", letterSpacing: ".5px", marginBottom: 14 }}>الأسئلة الشائعة</div>
            <h2 style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-.8px", margin: 0, lineHeight: 1.1 }}>كل ما تريد معرفته</h2>
          </Reveal>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FAQS.map((f, i) => {
              const open = i === openFaq;
              return (
                <Reveal
                  key={f.q}
                  translateY={20}
                  duration={0.5}
                  delay={f.delay}
                  style={{ background: "var(--n-surface)", border: `1px solid ${open ? "var(--a-300)" : "var(--n-border)"}`, borderRadius: "var(--r-lg)", overflow: "hidden" }}
                >
                  <button
                    onClick={() => setOpenFaq((p) => (p === i ? -1 : i))}
                    aria-expanded={open}
                    style={{
                      fontFamily: "inherit",
                      width: "100%",
                      textAlign: "right",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "22px 26px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 600, color: "var(--t-primary)" }}>{f.q}</span>
                    <span
                      style={{
                        flex: "none",
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: open ? "var(--g-900)" : "var(--g-50)",
                        color: open ? "var(--a-300)" : "var(--g-600)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "transform .3s var(--ease)",
                        transform: `rotate(${open ? "135deg" : "0deg"})`,
                      }}
                    >
                      <Icon size={17} strokeWidth={2.2}>
                        <path d="M12 5v14M5 12h14" />
                      </Icon>
                    </span>
                  </button>
                  <div style={{ maxHeight: open ? "260px" : "0px", overflow: "hidden", transition: "max-height .35s var(--ease)" }}>
                    <p style={{ fontSize: 15.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: 0, padding: "0 26px 24px" }}>{f.a}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "var(--n-surface)", borderTop: "1px solid var(--n-border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "72px 40px 32px" }}>
          <div className="sk-foot" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40 }}>
            <div>
              <div style={{ marginBottom: 20 }}>
                <SukunLogo size={72} />
              </div>
              <p style={{ fontSize: 14.5, color: "var(--t-secondary)", lineHeight: 1.7, maxWidth: 300, margin: "0 0 20px" }}>
                منصّة عقارية ذكية تُوحّد رحلة ما بعد التسليم للمطوّرين والملّاك والمقاولين في نظامٍ واحد.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {SOCIALS.map((s) => (
                  <a
                    key={s.name}
                    href="#top"
                    aria-label={s.name}
                    style={{ width: 40, height: 40, borderRadius: "var(--r-md)", border: "1px solid var(--n-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t-secondary)" }}
                  >
                    <Icon size={19}>{s.icon}</Icon>
                  </a>
                ))}
              </div>
            </div>
            {FOOT_COLS.map((col) => (
              <div key={col.title}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t-primary)", marginBottom: 16 }}>{col.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {col.links.map((lk) => (
                    <a key={lk} href="#top" style={{ fontSize: 14, color: "var(--t-secondary)" }}>
                      {lk}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginTop: 52, paddingTop: 26, borderTop: "1px solid var(--n-border)", fontSize: 13, color: "var(--t-tertiary)" }}>
            <span>© 2026 سكن. جميع الحقوق محفوظة.</span>
            <div style={{ display: "flex", gap: 22 }}>
              <a href="#top" style={{ color: "var(--t-tertiary)" }}>سياسة الخصوصية</a>
              <a href="#top" style={{ color: "var(--t-tertiary)" }}>الشروط والأحكام</a>
              <a href="#top" style={{ color: "var(--t-tertiary)" }}>العربية / EN</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
