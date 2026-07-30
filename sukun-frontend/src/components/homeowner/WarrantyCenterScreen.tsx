"use client";

/**
 * H10 · الضمان (Warranty Center) — ported from `Sakn Warranty Center.dc.html`
 * (Downloads/Sakn.d.zip). Entirely static/informational content — coverage
 * data is never fetched anywhere in the source either. `HomeownerNav` used
 * instead of the source's own top pill nav, same precedent as H9.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { HOMEOWNER_ACTIVE_ONLY } from "@/lib/auth/roles";
import { SCREEN_PATHS } from "@/lib/nav/routes";
import { HomeownerNav } from "@/components/nav/HomeownerNav";
import { DEMO_MODE } from "@/lib/demo/config";
import { useMyHome, useWarranty } from "@/lib/hooks/useMyHome";
import type { WarrantyTone } from "@/lib/adapters/warranty";

interface Topic {
  id: string; title: string; description: string; tone?: "ok" | "warn" | "err";
  period?: string; covered?: string[]; notCovered?: string[]; bullets?: string[]; notes?: string;
}

const COVERAGE: Topic[] = [
  { id: "structure", title: "الهيكل الإنشائي", tone: "ok", description: "يشمل الأساسات، الأعمدة، والجدران الحاملة للمبنى.", period: "10 سنوات من تاريخ الاستلام", covered: ["تشققات إنشائية في الجدران الحاملة", "هبوط أو ميل في الأساسات"], notCovered: ["تشققات سطحية ناتجة عن الرطوبة الموسمية"], notes: "يُراجع فريق سكن الحالة ميدانياً عند الحاجة قبل اعتماد الإصلاح." },
  { id: "plumbing", title: "السباكة", tone: "ok", description: "يشمل شبكات المياه والصرف الصحي الرئيسية داخل الوحدة.", period: "سنتان من تاريخ الاستلام", covered: ["تسريب في الأنابيب الرئيسية", "انسداد في التمديدات الأساسية"], notCovered: ["انسداد ناتج عن سوء استخدام المستخدم"], notes: "الأعطال الناتجة عن التركيبات الإضافية بعد التسليم غير مشمولة." },
  { id: "electrical", title: "الكهرباء", tone: "ok", description: "يشمل التمديدات الكهربائية الأساسية ولوحة التوزيع.", period: "سنتان من تاريخ الاستلام", covered: ["عطل في لوحة التوزيع الرئيسية", "قصر كهربائي في التمديدات الأساسية"], notCovered: ["أعطال الأجهزة الكهربائية الخاصة بالمالك"] },
  { id: "doors", title: "الأبواب والنوافذ", tone: "warn", description: "تغطية محددة تشمل عيوب التصنيع فقط خلال فترة قصيرة.", period: "سنة واحدة من تاريخ الاستلام", covered: ["عيوب تصنيع في المفصلات والأقفال"], notCovered: ["خدوش أو تلف ناتج عن الاستخدام اليومي"], notes: "يُنصح بالإبلاغ خلال أول ٣ أشهر من الاستلام لأفضل تغطية." },
  { id: "paint", title: "الدهانات", tone: "warn", description: "تغطية محددة تقتصر على عيوب الدهان الظاهرة عند الاستلام.", period: "6 أشهر من تاريخ الاستلام", covered: ["تقشّر أو فقاعات ظاهرة عند التسليم"], notCovered: ["تغيّر اللون الطبيعي بمرور الوقت"] },
  { id: "misuse", title: "التشطيبات الناتجة عن سوء الاستخدام", tone: "err", description: "أي ضرر ناتج عن سوء الاستخدام أو الإهمال غير مشمول بالضمان.", period: "غير مشمول", notCovered: ["كسر أو خدوش ناتجة عن سوء الاستخدام", "أضرار ناتجة عن تعديلات غير معتمدة"], notes: "يمكنك رفع بلاغ رغم ذلك، وسيقيّم سكن الحالة قبل اتخاذ قرار نهائي." },
];
const INFO: Topic[] = [
  { id: "duration", title: "مدة الضمان", description: "تختلف مدة الضمان حسب نوع العنصر — من ٦ أشهر للدهانات حتى ١٠ سنوات للهيكل الإنشائي.", bullets: ["الهيكل الإنشائي: ١٠ سنوات", "السباكة والكهرباء: سنتان", "الأبواب والدهانات: تغطية قصيرة محددة"] },
  { id: "terms", title: "الشروط الأساسية", description: "يسري الضمان طالما بقيت الوحدة كما سُلّمت دون تعديلات غير معتمدة.", bullets: ["يبدأ الضمان من تاريخ استلام الوحدة رسمياً", "التعديلات غير المعتمدة قد تُسقط تغطية العنصر المتأثر"] },
  { id: "exclusions", title: "الاستثناءات", description: "بعض الحالات لا يغطيها الضمان بشكل مباشر، لكن يمكنك دائماً رفع بلاغ.", bullets: ["سوء الاستخدام أو الإهمال", "التآكل الطبيعي مع الزمن", "الكوارث الطبيعية والحوادث الخارجية"] },
  { id: "rights", title: "حقوق المالك", description: "كل مشكلة تقع ضمن نطاق الضمان يحق لك الإبلاغ عنها دون أي تكلفة.", bullets: ["الإبلاغ عن أي مشكلة دون رسوم إضافية", "متابعة حالة الإصلاح حتى إغلاقه", "تصعيد الحالة إلى سكن عند التأخر"] },
];
const FAQ: [string, string][] = [
  ["متى ينتهي الضمان؟", "تختلف المدة حسب نوع العنصر — من ٦ أشهر للدهانات حتى ١٠ سنوات للهيكل الإنشائي."],
  ["هل يشمل سوء الاستخدام؟", "لا، الأضرار الناتجة عن سوء الاستخدام أو الإهمال غير مشمولة بالضمان، لكن يمكنك دائماً رفع بلاغ."],
  ["هل أحتاج التواصل مع المطوّر؟", "لا حاجة لذلك. ارفع بلاغك من خلال سكن وسيتولّى التواصل مع المطوّر والمقاول المسؤول تلقائياً."],
  ["ماذا يحدث إذا انتهى الضمان؟", "يمكنك الاستمرار في رفع البلاغات، وسيتم توجيهها إلى الجهة المختصة حتى بعد انتهاء فترة الضمان."],
];
const toneMap = { ok: { tint: "var(--g-700)", tintBg: "var(--g-50)", status: "مشمول" }, warn: { tint: "var(--warn-strong)", tintBg: "var(--warn-bg)", status: "تغطية محددة" }, err: { tint: "var(--err)", tintBg: "var(--err-bg)", status: "غير مشمول" } } as const;
const card: React.CSSProperties = { background: "var(--n-surface)", border: "1px solid var(--n-border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-1)" };

/**
 * Task 2 · the ONE data seam on this screen.
 *
 * The six coverage cards, their titles, descriptions, covered/not-covered
 * example lists, the info topics and the FAQ above are this screen's approved
 * editorial content and stay exactly where they are. What the Backend owns is
 * STATE — whether a category is still covered for THIS unit, how long each
 * period actually runs, and how much of the overall warranty is left — and all
 * of it arrives already computed by `warranty.rules.ts`. Nothing below
 * recomputes a duration or re-derives a verdict.
 *
 * `STATIC_TONES` is each card's own editorial classification (a ten-year
 * coverage reads "مشمول"; a deliberately short one reads "تغطية محددة"). It is
 * kept while the server says the category is covered, and overridden to "غير
 * مشمول" the moment the server says it is not.
 */
const STATIC_TONES: Record<string, WarrantyTone> = Object.fromEntries(
  COVERAGE.map((c) => [c.id, (c.tone ?? "ok") as WarrantyTone]),
);

/** The approved header facts, so Demo Mode renders byte-for-byte what it always did. */
const DEMO_HEADER = {
  statusLabel: "الضمان ساري",
  remainingLabel: "7 سنوات و4 أشهر",
  startDateLabel: "12 مارس 2022",
  endDateLabel: "12 مارس 2032",
};
/**
 * Real mode before the request settles, and after it fails. The screen has no
 * approved loading or error presentation of its own, so its existing "unknown
 * value" placeholder is reused rather than a new state being designed in
 * Task 2 (recorded for Task 3). It never shows the demo figures as recovery.
 */
const UNKNOWN_HEADER = {
  statusLabel: "—",
  remainingLabel: "—",
  startDateLabel: "—",
  endDateLabel: "—",
};

export function WarrantyCenterScreen() {
  return (
    <RouteGuard allow={HOMEOWNER_ACTIVE_ONLY}>
      <WarrantyCenterScreenInner />
    </RouteGuard>
  );
}

function WarrantyCenterScreenInner() {
  const router = useRouter();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  // Task 2 · real warranty state. `useMyHome` supplies the caller's OWN unit id
  // — the only legitimate source — and `useWarranty` stays disabled until it
  // has one, so no request is ever fired that is certain to 404. Both hooks are
  // inert in Demo Mode and make no network call at all.
  const myHome = useMyHome();
  const live = useWarranty(myHome.home?.unit.id ?? null, STATIC_TONES).warranty;
  const header = live ?? (DEMO_MODE ? DEMO_HEADER : UNKNOWN_HEADER);
  const liveById = new Map((live?.categories ?? []).map((c) => [c.id, c]));

  /** The server's verdict when there is one; the card's own classification otherwise. */
  const toneOf = (id: string, fallback: WarrantyTone): WarrantyTone =>
    liveById.get(id)?.tone ?? fallback;
  /** The server's real coverage period when there is one; the card's own copy otherwise. */
  const periodOf = (id: string, fallback: string | undefined): string | undefined =>
    liveById.get(id)?.period ?? fallback;

  const allTopics = [...COVERAGE, ...INFO];
  const topic = allTopics.find((t) => t.id === topicId);

  if (topic) {
    const tn = topic.tone ? toneMap[toneOf(topic.id, topic.tone)] : null;
    const topicPeriod = periodOf(topic.id, topic.period);
    return (
      <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 90 }}>
        <HomeownerNav />
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px" }}>
          <button onClick={() => setTopicId(null)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--t-secondary)", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>← الضمان</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>{topic.title}</h2>
          {tn && <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: tn.tint, background: tn.tintBg, padding: "4px 11px", borderRadius: "var(--r-full)", marginBottom: 14 }}>{tn.status}</span>}
          <p style={{ fontSize: 14.5, color: "var(--t-secondary)", lineHeight: 1.8, margin: "0 0 20px" }}>{topic.description}</p>
          {topicPeriod && <div style={{ background: "var(--n-surface2)", borderRadius: "var(--r-md)", padding: "14px 16px", marginBottom: 20, fontSize: 13.5, fontWeight: 600 }}>فترة التغطية: {topicPeriod}</div>}
          {topic.covered && topic.covered.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--g-700)", marginBottom: 10 }}>أمثلة مشمولة</div>
              {topic.covered.map((c) => <div key={c} style={{ background: "var(--ok-bg)", borderRadius: "var(--r-md)", padding: "11px 14px", marginBottom: 8, fontSize: 13.5 }}>✓ {c}</div>)}
            </div>
          )}
          {topic.notCovered && topic.notCovered.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--err)", marginBottom: 10 }}>أمثلة غير مشمولة</div>
              {topic.notCovered.map((c) => <div key={c} style={{ background: "var(--err-bg)", borderRadius: "var(--r-md)", padding: "11px 14px", marginBottom: 8, fontSize: 13.5 }}>✕ {c}</div>)}
            </div>
          )}
          {topic.bullets && (
            <div style={{ marginBottom: 20 }}>
              {topic.bullets.map((b) => <div key={b} style={{ ...card, padding: "12px 14px", marginBottom: 8, fontSize: 13.5 }}>• {b}</div>)}
            </div>
          )}
          {topic.notes && <div style={{ background: "var(--a-50)", borderRadius: "var(--r-md)", padding: "14px 16px", fontSize: 13, color: "var(--a-800)" }}>ⓘ {topic.notes}</div>}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" data-sk-mobile-fit style={{ minHeight: "100dvh", background: "var(--n-bg)", paddingBottom: 90 }}>
      <HomeownerNav />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>الضمان</h1>
          <span className="sk-only-mobile"><AccountMenu variant="compact" /></span>
        </div>
        <p style={{ fontSize: 13, color: "var(--t-secondary)", margin: "0 0 20px" }}>اطّلع على حالة الضمان وما يشمله لوحدتك السكنية.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", background: "var(--g-900)", borderRadius: "var(--r-2xl)", overflow: "hidden", boxShadow: "var(--sh-3)" }}>
          <div style={{ padding: "26px 28px", color: "var(--t-on-dark)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: "var(--r-full)", background: "rgba(47,158,106,.18)", color: "var(--ok-on-dark)" }}>{`● ${header.statusLabel}`}</span>
            <div style={{ marginTop: 20 }}><div style={{ fontSize: 12, color: "var(--t-on-dark-soft)", marginBottom: 5 }}>المتبقي</div><div style={{ fontSize: 24, fontWeight: 700 }}>{header.remainingLabel}</div></div>
            <div style={{ display: "flex", gap: 26, marginTop: 22 }}>
              <div><div style={{ fontSize: 11.5, color: "var(--t-on-dark-soft)" }}>بداية الضمان</div><div style={{ fontSize: 14, fontWeight: 600 }}>{header.startDateLabel}</div></div>
              <div><div style={{ fontSize: 11.5, color: "var(--t-on-dark-soft)" }}>نهاية الضمان</div><div style={{ fontSize: 14, fontWeight: 600 }}>{header.endDateLabel}</div></div>
            </div>
          </div>
          <div style={{ background: "linear-gradient(160deg,rgba(var(--a-500-rgb), .14),transparent)" }} />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 14px" }}>ما الذي يشمله الضمان؟</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {COVERAGE.map((c) => {
            const tn = toneMap[toneOf(c.id, c.tone!)];
            return (
              <button key={c.id} onClick={() => setTopicId(c.id)} style={{ ...card, textAlign: "right", padding: 16, cursor: "pointer" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: tn.tint, background: tn.tintBg, padding: "4px 10px", borderRadius: "var(--r-full)" }}>{tn.status}</span>
              </button>
            );
          })}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 14px" }}>معلومات الضمان</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {INFO.map((i) => (
            <button key={i.id} onClick={() => setTopicId(i.id)} style={{ ...card, textAlign: "right", padding: 16, cursor: "pointer" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i.title}</div>
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 14px" }}>الأسئلة الشائعة</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQ.map(([q, a], i) => (
            <div key={q} style={{ ...card, overflow: "hidden" }}>
              <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "16px 18px", background: "none", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600 }}>{q}<span>{faqOpen === i ? "−" : "+"}</span></button>
              {faqOpen === i && <div style={{ padding: "0 18px 16px", fontSize: 13.5, color: "var(--t-secondary)" }}>{a}</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, background: "var(--g-900)", borderRadius: "var(--r-xl)", padding: "26px 28px", color: "var(--t-on-dark)", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>هل واجهت مشكلة في وحدتك؟</div>
            <div style={{ fontSize: 13.5, color: "var(--t-on-dark-soft)" }}>لا تحتاج لمعرفة ما إذا كانت المشكلة مشمولة بالضمان. أبلغ عنها.</div>
          </div>
          <button onClick={() => router.push(SCREEN_PATHS.H8_ReportJourney)} style={{ fontSize: 14.5, fontWeight: 600, padding: "14px 24px", border: "none", borderRadius: "var(--r-md)", background: "var(--t-on-dark)", color: "var(--g-900)", cursor: "pointer" }}>رفع بلاغ</button>
        </div>
      </div>
    </div>
  );
}
