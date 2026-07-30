/**
 * The mocked implementation of `SaknAi`. Deliberately the ONLY file with
 * invented inference in it — deleting this file and pointing `client.ts` at
 * a real HTTP client is the entire integration job.
 *
 * It behaves like a network service on purpose: real latency, staged
 * progress, and a failure path. Screens that only ever saw an instant happy
 * result would need rework the day the real model is slow or wrong; these
 * ones already handle it.
 */

import {
  LOW_CONFIDENCE_THRESHOLD,
  type AdvisorReply,
  type AdvisorReplyInput,
  type AnalyzeDefectInput,
  type DefectAnalysis,
  type DefectCategory,
  type DefectSeverity,
  type RepairComparison,
  type RepairComparisonInput,
  type SaknAi,
  type WarrantyOpinion,
  type WarrantyOpinionInput,
} from "./contract";

const MODEL = "sakn-vision-preview";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Deterministic per-file hash — the same photo always yields the same
 * finding, so re-running an analysis in a demo doesn't silently change the
 * answer mid-conversation.
 */
function hashOf(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

interface DefectTemplate {
  summary: string;
  category: DefectCategory;
  severity: DefectSeverity;
  location: string;
  probableCause: string;
  actions: string[];
  confidence: number;
}

const DEFECT_LIBRARY: DefectTemplate[] = [
  {
    summary: "تسرّب مياه أسفل حوض المطبخ حول وصلة الصرف.",
    category: "سباكة",
    severity: "عالية",
    location: "المطبخ — أسفل حوض الغسيل",
    probableCause: "تآكل الحلقة المطاطية في وصلة الصرف سمح بتسرّب بطيء ومستمر.",
    actions: [
      "أغلق محبس المياه الفرعي للمطبخ حتى وصول المقاول.",
      "ضع وعاءً أسفل التسريب لمنع تلف الخزانة.",
      "تجنّب استخدام الحوض للأحمال الثقيلة اليوم.",
    ],
    confidence: 94,
  },
  {
    summary: "تشقق شعري في جدار الصالة يمتد أفقياً أسفل النافذة.",
    category: "تشققات",
    severity: "متوسطة",
    location: "الصالة — الجدار الشرقي أسفل النافذة",
    probableCause: "انكماش طبيعي في طبقة اللياسة خلال السنة الأولى بعد التسليم.",
    actions: [
      "راقب اتساع الشق خلال الأسبوعين القادمين.",
      "تجنّب تعليق أوزان ثقيلة على هذا الجدار.",
    ],
    confidence: 88,
  },
  {
    summary: "تلف في مفصلات نافذة الألمنيوم يمنع الإغلاق الكامل.",
    category: "نوافذ",
    severity: "متوسطة",
    location: "غرفة النوم الرئيسية — النافذة الشمالية",
    probableCause: "ارتخاء مسامير التثبيت في المفصلة السفلية مع الاستخدام المتكرر.",
    actions: [
      "لا تُجبر النافذة على الإغلاق حتى لا تتضرر الحافة.",
      "أبقِ النافذة مغلقة جزئياً لتقليل دخول الغبار.",
    ],
    confidence: 91,
  },
  {
    summary: "تقشّر في طبقة الدهان بسقف دورة المياه مع أثر رطوبة.",
    category: "دهانات",
    severity: "متوسطة",
    location: "دورة المياه — السقف بجانب فتحة التهوية",
    probableCause: "تهوية غير كافية أدّت إلى تكثّف بخار الماء على السقف.",
    actions: [
      "شغّل الشفّاط أثناء الاستحمام ولمدة عشر دقائق بعده.",
      "أبقِ الباب موارباً لتحسين تصريف الرطوبة.",
    ],
    confidence: 83,
  },
  {
    summary: "قاطع الكهرباء الخاص بمنافذ المطبخ يفصل بشكل متكرر.",
    category: "كهرباء",
    severity: "حرجة",
    location: "لوحة التوزيع — القاطع الفرعي رقم ٤",
    probableCause: "حمل زائد على الدائرة أو خلل في أحد المنافذ يسبب فصلاً وقائياً.",
    actions: [
      "افصل الأجهزة عالية الاستهلاك عن منافذ المطبخ فوراً.",
      "لا تُعِد رفع القاطع أكثر من مرة واحدة.",
      "تواصل مع الطوارئ إذا صاحب الفصل رائحة احتراق.",
    ],
    confidence: 96,
  },
  {
    summary: "ارتخاء في بلاطة أرضية بالممر يُحدث صوتاً عند المشي.",
    category: "أرضيات",
    severity: "منخفضة",
    location: "الممر — أمام غرفة الملابس",
    probableCause: "فراغ هوائي أسفل البلاطة نتيجة عدم اكتمال مونة التثبيت.",
    actions: ["تجنّب الطرق المباشر على البلاطة حتى المعالجة."],
    confidence: 79,
  },
];

/**
 * One template is deliberately low-confidence so the "AI could not decide"
 * branch is reachable in a demo — it is what proves the manual-classification
 * fallback actually works.
 */
const UNCERTAIN: DefectTemplate = {
  summary: "لم يتمكّن المستشار من تحديد نوع العطل بدقة كافية من هذه الصورة.",
  category: "أخرى",
  severity: "متوسطة",
  location: "غير محدّد",
  probableCause: "الصورة غير واضحة أو تُظهر زاوية لا تكفي للتشخيص.",
  actions: [
    "صوّر المشكلة من مسافة أقرب وبإضاءة أفضل.",
    "أو أكمل التصنيف يدوياً وسنوجّه البلاغ فوراً.",
  ],
  confidence: 41,
};

export const mockAi: SaknAi = {
  async analyzeDefect(input: AnalyzeDefectInput): Promise<DefectAnalysis> {
    const started = Date.now();
    await wait(2600);

    if (input.images.length === 0) {
      throw new Error("AI_NO_IMAGE");
    }

    const first = input.images[0];
    const seed = hashOf(`${first.name}:${first.size}`);
    // ~1 in 7 uploads comes back uncertain, so the fallback path is reachable
    // without rigging the demo.
    const uncertain = seed % 7 === 3;
    const t = uncertain ? UNCERTAIN : DEFECT_LIBRARY[seed % DEFECT_LIBRARY.length];

    return {
      analysisId: id("dfa"),
      model: MODEL,
      source: "mock",
      latencyMs: Date.now() - started,
      summary: t.summary,
      category: t.category,
      confidence: t.confidence,
      severity: t.severity,
      location: t.location,
      probableCause: t.probableCause,
      boundingBox: uncertain
        ? null
        : {
            x: 0.18 + (seed % 5) * 0.04,
            y: 0.22 + (seed % 3) * 0.05,
            width: 0.42,
            height: 0.34,
          },
      recommendedActions: t.actions,
    };
  },

  async warrantyOpinion(input: WarrantyOpinionInput): Promise<WarrantyOpinion> {
    const started = Date.now();
    await wait(900);

    const SCOPES: Record<string, { type: string; scope: string; period: string }> = {
      "سباكة": { type: "سباكة أساسية", scope: "الأنابيب والتمديدات ووصلات الصرف الرئيسية", period: "سنتان من تاريخ الاستلام" },
      "كهرباء": { type: "كهرباء أساسية", scope: "التمديدات الأساسية ولوحة التوزيع والقواطع", period: "سنتان من تاريخ الاستلام" },
      "تشققات": { type: "إنشائي", scope: "التشققات الإنشائية المؤثرة على سلامة المبنى", period: "عشر سنوات من تاريخ الاستلام" },
      "نوافذ": { type: "تشطيبات", scope: "إطارات ومفصلات النوافذ وعوازلها", period: "سنة واحدة من تاريخ الاستلام" },
      "أبواب": { type: "تشطيبات", scope: "الأبواب ومفصلاتها وأقفالها", period: "سنة واحدة من تاريخ الاستلام" },
      "دهانات": { type: "تشطيبات", scope: "عيوب الدهان الناتجة عن التنفيذ", period: "سنة واحدة من تاريخ الاستلام" },
      "أرضيات": { type: "تشطيبات", scope: "تبليط الأرضيات ومونة التثبيت", period: "سنة واحدة من تاريخ الاستلام" },
      "أسقف": { type: "تشطيبات", scope: "تشطيب وعزل الأسقف", period: "سنتان من تاريخ الاستلام" },
    };

    const entry = SCOPES[String(input.category)] ?? {
      type: "غير مصنّف",
      scope: "هذا النوع من الأعطال",
      period: "يُحدَّد بعد المعاينة",
    };
    const covered = input.withinWarrantyWindow !== false && entry.type !== "غير مصنّف";

    return {
      analysisId: id("wrt"),
      model: MODEL,
      source: "mock",
      latencyMs: Date.now() - started,
      covered,
      coverageType: entry.type,
      coveragePeriod: entry.period,
      rationale: covered
        ? `العطل من فئة «${input.category}»، وهي مشمولة ضمن تغطية «${entry.type}» التي تغطي ${entry.scope}. التغطية سارية لمدة ${entry.period}، ولا تتحمّل أي تكلفة.`
        : `العطل من فئة «${input.category}» لا يقع ضمن التغطية الأساسية، إمّا لانتهاء مدة الضمان أو لأن السبب يعود إلى الاستخدام لا إلى التنفيذ. سنوضّح التكلفة قبل أي إجراء.`,
      caveats: covered
        ? ["لا تشمل التغطية الأضرار الناتجة عن سوء الاستخدام أو التعديلات غير المعتمدة."]
        : ["يمكنك رفع البلاغ رغم ذلك، وسيتم تزويدك بعرض سعر قبل بدء العمل."],
    };
  },

  async compareRepair(input: RepairComparisonInput): Promise<RepairComparison> {
    const started = Date.now();
    await wait(1900);

    const seed = hashOf(input.afterImages.join("|") || "after");
    const completionPercent = 82 + (seed % 17);
    const quality =
      completionPercent >= 95 ? "ممتازة" : completionPercent >= 88 ? "جيدة" : "مقبولة";

    return {
      analysisId: id("rpc"),
      model: MODEL,
      source: "mock",
      latencyMs: Date.now() - started,
      completionPercent,
      quality,
      remainingIssues:
        completionPercent >= 95
          ? []
          : [
              "أثر رطوبة خفيف ما زال ظاهراً على الحافة السفلية.",
              "يُنصح بمعاينة الموقع بعد أسبوع للتأكد من عدم عودة المشكلة.",
            ].slice(0, completionPercent >= 90 ? 1 : 2),
      verdict:
        completionPercent >= 95
          ? "تمّت معالجة العطل بالكامل، ولا تظهر أي آثار متبقية في الصورة بعد الإصلاح."
          : "تمّت معالجة الجزء الأساسي من العطل، مع ملاحظات بسيطة تستحق المتابعة.",
    };
  },

  async advisorReply(input: AdvisorReplyInput): Promise<AdvisorReply> {
    const started = Date.now();
    await wait(1100);

    const q = input.question;
    const has = (...w: string[]) => w.some((x) => q.includes(x));
    const ctx = (input.context ?? {}) as {
      topName?: string;
      topCity?: string;
      topMatch?: number;
      topDistrict?: string;
      topDeveloper?: string;
      topPrice?: string;
      altName?: string;
      altCity?: string;
      altMatch?: number;
      altPrice?: string;
      topId?: number;
      altId?: number;
    };
    const top = ctx.topName ?? "المشروع المرشّح";
    const cited = [ctx.topId, ctx.altId].filter((x): x is number => typeof x === "number");

    let text: string;
    let suggestions: string[];

    if (has("لماذا", "ليش", "سبب", "اخترت")) {
      text = `رشّحت «${top}» لأنه الأقرب لملفّك من ثلاث زوايا: الموقع في ${ctx.topCity ?? "المدينة التي اخترتها"}، والسعر ضمن الحد الذي حدّدته (${ctx.topPrice ?? "ضمن ميزانيتك"})، وعدد الغرف الذي طلبته. نسبة التوافق ${ctx.topMatch ?? 0}% تلخّص تطابقه مع تفضيلاتك المسجّلة — وهي تقدير إرشادي لا يغني عن معاينتك.`;
      suggestions = ["ما الفرق بينه وبين البديل؟", "هل الحي مناسب للعائلات؟", "احجز لي زيارة"];
    } else if (has("الفرق", "قارن", "مقارنة", "البديل")) {
      text = `الفرق الجوهري بينهما:\n\n«${top}» — ${ctx.topDistrict ?? ""}، ${ctx.topPrice ?? ""}، توافق ${ctx.topMatch ?? 0}%. الأقرب لتفضيلاتك المسجّلة.\n\n«${ctx.altName ?? "البديل"}» — ${ctx.altCity ?? ""}، ${ctx.altPrice ?? ""}، توافق ${ctx.altMatch ?? 0}%. خيار أنسب إن كانت الأولوية للسعر أكثر من الموقع.`;
      suggestions = ["أيهما أفضل للاستثمار؟", "هل المطوّر موثوق؟", "أرني مشاريع أخرى"];
    } else if (has("عائل", "أطفال", "مدارس", "أسر", "حي")) {
      text = `حي «${ctx.topDistrict ?? "الحي"}» يُصنّف كحي سكني هادئ: كثافة مرورية منخفضة داخل الأحياء الفرعية، ومدارس وخدمات يومية ضمن نطاق قريب. إن كان القرب من المدارس أولوية أولى لديك، أنصحك بزيارة الموقع في وقت الذروة الصباحية لتقييم الحركة بنفسك.`;
      suggestions = ["ما المسافة إلى أقرب مدرسة؟", "احجز لي زيارة", "قارن مع البديل"];
    } else if (has("مطور", "مطوّر", "موثوق", "شركة", "جودة")) {
      text = `المطوّر «${ctx.topDeveloper ?? "المطوّر"}» له سجل تسليم منتظم في المشاريع السكنية، والتزام معلن بمواعيد التسليم. ومع ذلك، أنصحك دائماً بالاطلاع على وحدة مسلّمة فعلياً — لا على النموذج التسويقي — قبل اتخاذ القرار.`;
      suggestions = ["ما مدة الضمان؟", "احجز لي زيارة", "لماذا رشّحت هذا المشروع؟"];
    } else if (has("توافق", "تعني", "النسبة", "ماذا تعني")) {
      text = `نسبة التوافق تقيس تطابق المشروع مع أربعة عوامل سجّلتها: المدينة، الحد الأعلى للميزانية، نوع العقار، وعدد الغرف. كل عامل له وزن، والنسبة النهائية هي حاصل جمعها. هي أداة ترتيب أولويات — وليست حكماً على جودة المشروع نفسه.`;
      suggestions = ["كيف أعدّل تفضيلاتي؟", "لماذا رشّحت هذا المشروع؟"];
    } else if (has("استثمار", "عائد", "بيع", "أسعار")) {
      text = `للاستثمار، انظر إلى ثلاثة مؤشرات قبل السعر: نضج الخدمات حول المشروع، وخطط التطوير المعلنة للمنطقة، ومعدل الإشغال في المشاريع المجاورة. «${top}» يقع في ${ctx.topCity ?? "منطقة"} نشطة عقارياً، لكن قرار الاستثمار يحتاج معاينة ميدانية ومقارنة أسعار فعلية للوحدات المباعة.`;
      suggestions = ["قارن مع البديل", "هل المطوّر موثوق؟"];
    } else if (has("ميزاني", "سعر", "أرخص", "تكلفة")) {
      text = `ضمن الحد الذي حدّدته، «${top}» يأتي بـ${ctx.topPrice ?? "سعر ضمن نطاقك"}. إن أردت خفض التكلفة، الخيار الأقرب هو «${ctx.altName ?? "البديل"}» بـ${ctx.altPrice ?? "سعر أقل"} — الفارق الأساسي بينهما في الموقع لا في المساحة.`;
      suggestions = ["ما الفرق بينهما؟", "عدّل ميزانيتي"];
    } else {
      text = `أنا مستشارك العقاري في سُكن — أساعدك على فهم سبب كل ترشيح، ومقارنة المشاريع والأحياء والمطوّرين، وتقدير ما يناسب أسلوب حياتك. اسألني بصيغتك الطبيعية، أو ابدأ بأحد الاقتراحات أدناه.`;
      suggestions = [
        "لماذا رشّحت لي هذا المشروع؟",
        "ما الفرق بينه وبين البديل؟",
        "هل هذا الحي مناسب للعائلات؟",
      ];
    }

    return {
      analysisId: id("adv"),
      model: MODEL,
      source: "mock",
      latencyMs: Date.now() - started,
      text,
      suggestions,
      citedProjectIds: cited,
    };
  },
};

export { LOW_CONFIDENCE_THRESHOLD };
