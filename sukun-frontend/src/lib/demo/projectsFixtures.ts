/**
 * `Sakn Projects Management.dc.html`'s own seed data (`SEED`/`MANAGERS`/
 * `CONTRACTORS` constants), carried over verbatim — this is the exact demo
 * content the production screen itself ships with, not invented. Used as
 * the Demo Mode fallback when `GET /projects` is unreachable, and always
 * for the manager/contractor picker steps (no `/managers` or `/contractors`
 * list endpoint exists anywhere in the backend yet).
 */
export interface DemoProjectRow {
  id: string;
  name: string;
  status: "قيد التنفيذ" | "مكتمل" | "متوقف";
  city: string;
  district: string;
  desc: string;
  buildings: number;
  units: number;
  occupied: number;
  open: number;
  satisfaction: string;
  manager: string;
  contractor: string;
  health: "ممتاز" | "يحتاج متابعة" | "حرج";
  created: string;
  active: boolean;
  /** Cover photo for the portfolio row's image slot (`public/projects/`). */
  cover: string;
}

export const DEMO_PROJECTS: DemoProjectRow[] = [
  { id: "p1", name: "مشروع أوج الشمال", status: "قيد التنفيذ", city: "الرياض", district: "حي الياسمين", desc: "مجمع سكني من ثمانية مبانٍ في شمال الرياض.", buildings: 8, units: 120, occupied: 96, open: 14, satisfaction: "4.6", manager: "أحمد الغامدي", contractor: "مؤسسة البناء المتين", health: "يحتاج متابعة", cover: "/projects/co-p1-cover.jpg", created: "١٢ يناير ٢٠٢٥", active: true },
  { id: "p2", name: "مشروع أوج الواحة", status: "مكتمل", city: "جدة", district: "حي الشاطئ", desc: "خمسة مبانٍ مسلّمة بالكامل على الواجهة البحرية.", buildings: 5, units: 74, occupied: 71, open: 3, satisfaction: "4.8", manager: "سارة العتيبي", contractor: "شركة الإتقان للصيانة", health: "ممتاز", cover: "/projects/co-p2-cover.jpg", created: "٣ مارس ٢٠٢٤", active: true },
  { id: "p3", name: "مشروع أوج الروابي", status: "قيد التنفيذ", city: "الدمام", district: "حي الفيصلية", desc: "ستة مبانٍ قيد الإنشاء مع تسليم جزئي.", buildings: 6, units: 88, occupied: 41, open: 27, satisfaction: "3.9", manager: "ماجد الحربي", contractor: "مجموعة الأساس", health: "حرج", cover: "/projects/co-p3-cover.jpg", created: "٢٧ سبتمبر ٢٠٢٥", active: true },
  { id: "p4", name: "مشروع أوج النخيل", status: "مكتمل", city: "الرياض", district: "حي النرجس", desc: "أربعة مبانٍ سكنية مسلّمة.", buildings: 4, units: 52, occupied: 50, open: 5, satisfaction: "4.7", manager: "نورة الشمري", contractor: "شركة الإتقان للصيانة", health: "ممتاز", cover: "/projects/co-p4-cover.jpg", created: "١٩ يونيو ٢٠٢٤", active: true },
  { id: "p5", name: "مشروع أوج القصر", status: "متوقف", city: "الخبر", district: "حي العقربية", desc: "مشروع متوقف مؤقتاً بانتظار التراخيص.", buildings: 3, units: 36, occupied: 0, open: 0, satisfaction: "—", manager: "ماجد الحربي", contractor: "مجموعة الأساس", health: "يحتاج متابعة", cover: "/projects/co-p5-cover.jpg", created: "٨ نوفمبر ٢٠٢٥", active: false },
];

export interface DemoPickOption {
  id: string;
  name: string;
  meta: string;
}

export const DEMO_MANAGERS: DemoPickOption[] = [
  { id: "m1", name: "أحمد الغامدي", meta: "مدير مشروع أول · ٦ سنوات خبرة · مشروع واحد نشط" },
  { id: "m2", name: "سارة العتيبي", meta: "مديرة مشاريع · ٤ سنوات خبرة · مشروع واحد نشط" },
  { id: "m3", name: "ماجد الحربي", meta: "مدير مشروع · ٨ سنوات خبرة · مشروعان نشطان" },
  { id: "m4", name: "نورة الشمري", meta: "مديرة مشاريع · ٥ سنوات خبرة · مشروع واحد نشط" },
  { id: "m5", name: "عبدالله الدوسري", meta: "مدير مشروع · ٣ سنوات خبرة · متاح" },
];

export const DEMO_CONTRACTORS: DemoPickOption[] = [
  { id: "c1", name: "مؤسسة البناء المتين", meta: "سباكة وأعمال مدنية · تقييم ٤.٥" },
  { id: "c2", name: "شركة الإتقان للصيانة", meta: "كهرباء وتكييف · تقييم ٤.٨" },
  { id: "c3", name: "مجموعة الأساس", meta: "عزل وإنشاءات · تقييم ٤.١" },
  { id: "c4", name: "شركة رواسي للمقاولات", meta: "تشطيبات وصيانة عامة · تقييم ٤.٦" },
];
