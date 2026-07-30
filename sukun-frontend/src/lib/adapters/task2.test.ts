/**
 * Every Task 2 DTO adapter.
 *
 * The rule these tests exist to enforce: a fact the Backend did not state must
 * never appear in a view model. Nulls stay null, verdicts are displayed rather
 * than recomputed, permissions are the server's, and an "unavailable" is an
 * unavailable — not an empty list that reads like "nothing matched".
 */

import { describe, expect, it } from "vitest";
import type {
  DiscoveryProjectDetailDto,
  DiscoveryProjectSummaryDto,
} from "@/lib/backend/discovery";
import type { VisitDetailDto } from "@/lib/backend/visits";
import type { MyHomeDto } from "@/lib/backend/homeowners";
import type { WarrantyDto } from "@/lib/backend/warranty";
import type { ReportDetailDto, ReportSummaryDto } from "@/lib/backend/reports";
import { DEFAULT_PREFS, PROJECTS, type Preferences } from "@/lib/demo/discoveryFixtures";
import {
  DEFAULT_PROJECT_GRADIENT,
  MISSING_VALUE,
  numericIdFor,
  readinessLabel,
  toDemoProjectViewModel,
  toProjectDetailViewModel,
  toProjectViewModel,
  toRecommendationViewModel,
} from "./discovery";
import {
  canReschedule,
  canSubmitFeedback,
  isLive,
  phaseOf,
  toVisitEvents,
  toVisitListItemViewModel,
  toVisitViewModel,
} from "./visits";
import {
  relativeArabicDay,
  toActivityEvents,
  toAttentionItems,
  toMyHomeViewModel,
  toWarrantyChip,
} from "./homeowner";
import {
  CARD_ID_TO_CATEGORY_KEY,
  formatCoveragePeriod,
  formatRemaining,
  toneFor,
  toWarrantyViewModel,
} from "./warranty";
import {
  stageOf,
  statusPresentation,
  toReportDetailViewModel,
  toReportViewModel,
  toStatusCounts,
  toTimelineViewModel,
  timelineLabelFor,
  TIMELINE_FALLBACK_LABEL,
  warrantyExplanationOf,
  warrantyFlagOf,
} from "./reports";

/* ---------------------------------------------------------------- fixtures */

function summaryDto(over: Partial<DiscoveryProjectSummaryDto> = {}): DiscoveryProjectSummaryDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "واحة الياسمين",
    city: "الرياض",
    district: "حي النرجس",
    description: null,
    readiness: "READY",
    amenities: ["مسبح"],
    developerName: "شركة معمار",
    coverImageUrl: "https://cdn.test/cover.jpg",
    gallery: [{ url: "https://cdn.test/cover.jpg", isPlaceholder: false }],
    priceFrom: 2_400_000,
    priceTo: 3_000_000,
    unitTypes: ["فيلا"],
    unitsAvailableCount: 4,
    isSaved: false,
    isCurrentlyDiscoverable: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const PREFS: Preferences = { ...DEFAULT_PREFS, pCity: "الرياض", wType: "فيلا", wBudget: 3_000_000, wBeds: 4 };

/* --------------------------------------------------------------- discovery */

describe("discovery adapter", () => {
  it("maps the public-safe summary onto the frozen screens' shape", () => {
    const vm = toProjectViewModel(summaryDto(), null);
    expect(vm).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "واحة الياسمين",
      dev: "شركة معمار",
      city: "الرياض",
      district: "حي النرجس",
      price: 2_400_000,
      avail: "جاهز",
      type: "فيلا",
      img: "https://cdn.test/cover.jpg",
      grad: DEFAULT_PROJECT_GRADIENT,
      isSaved: false,
      isCurrentlyDiscoverable: true,
    });
  });

  it("leaves facts the list DTO does not carry as null, never as zero", () => {
    const vm = toProjectViewModel(summaryDto(), null);
    // Bedrooms/bathrooms/area are per-unit and DETAIL-only. Rendering 0 would
    // state something the Backend never said.
    expect(vm.beds).toBeNull();
    expect(vm.baths).toBeNull();
    expect(vm.area).toBeNull();
  });

  it("renders an unpriced project as the screen's own placeholder, not as free", () => {
    const vm = toProjectViewModel(summaryDto({ priceFrom: null }), null);
    expect(vm.price).toBeNull();
    expect(vm.priceLabel).toBe(MISSING_VALUE);
  });

  it("maps readiness onto the frozen filter's own labels", () => {
    expect(readinessLabel("READY")).toBe("جاهز");
    expect(readinessLabel("UNDER_CONSTRUCTION")).toBe("قريباً");
    expect(readinessLabel("OFF_PLAN")).toBe("قريباً");
    expect(readinessLabel(null)).toBe(MISSING_VALUE);
  });

  it("never fabricates a cover image", () => {
    const vm = toProjectViewModel(summaryDto({ coverImageUrl: null, gallery: [] }), null);
    expect(vm.img).toBe("");
    expect(vm.gallery).toEqual([]);
  });

  it("takes the smallest available unit's facts on the detail response", () => {
    const detail: DiscoveryProjectDetailDto = {
      ...summaryDto(),
      availableUnits: [
        { id: "u2", number: "2", type: "فيلا", area: 500, bedrooms: 6, bathrooms: 5, price: 3_000_000 },
        { id: "u1", number: "1", type: "شقة", area: 320, bedrooms: 4, bathrooms: 3, price: 2_400_000 },
      ],
      visitSlots: ["10:00", "12:00"],
    };
    const vm = toProjectDetailViewModel(detail, null);
    expect(vm.area).toBe(320);
    expect(vm.beds).toBe(4);
    expect(vm.baths).toBe(3);
    expect(vm.visitSlots).toEqual(["10:00", "12:00"]);
    expect(vm.availableUnits).toHaveLength(2);
  });

  it("scores a fixture project identically to before Task 2", () => {
    // The demo path must be bit-for-bit what it was: same `scoreOf`, same
    // numeric id, same reasons.
    const vm = toDemoProjectViewModel(PROJECTS[0], PREFS);
    expect(vm.id).toBe("1");
    expect(vm.match).toBeGreaterThan(0);
    expect(vm.reasons.length).toBeGreaterThan(0);
    expect(vm.priceLabel).toContain("مليون");
  });

  it("scores a real UUID project deterministically", () => {
    const a = toProjectViewModel(summaryDto(), PREFS);
    const b = toProjectViewModel(summaryDto(), PREFS);
    expect(a.match).toBe(b.match);
    expect(numericIdFor("11111111-1111-4111-8111-111111111111")).toBe(
      numericIdFor("11111111-1111-4111-8111-111111111111"),
    );
    expect(numericIdFor("3")).toBe(3);
    expect(numericIdFor("not-a-number")).toBeGreaterThanOrEqual(0);
  });

  it("surfaces an unavailable recommendation as unavailable, with its reason", () => {
    const vm = toRecommendationViewModel(
      { available: false, reason: "AI_SERVICE_UNAVAILABLE", items: [] },
      null,
    );
    expect(vm.state).toBe("unavailable");
    expect(vm.reasonCode).toBe("AI_SERVICE_UNAVAILABLE");
    expect(vm.items).toEqual([]);
  });

  it("uses the Backend's own Arabic reason for an available recommendation", () => {
    const vm = toRecommendationViewModel(
      { available: true, items: [{ project: summaryDto(), reason: "قريب من عملك" }] },
      PREFS,
    );
    expect(vm.state).toBe("available");
    expect(vm.reasonCode).toBeNull();
    // The real recommender's justification replaces the local heuristic's.
    expect(vm.items[0].project.reasons).toEqual(["قريب من عملك"]);
  });
});

/* ------------------------------------------------------------------ visits */

function visitDto(over: Partial<VisitDetailDto> = {}): VisitDetailDto {
  return {
    id: "v1",
    userId: "u1",
    projectId: "p1",
    unitId: "un1",
    searchJourneyId: "j1",
    date: "2026-08-01T00:00:00.000Z",
    time: "10:00",
    status: "CONFIRMED",
    checkedInAt: null,
    checkedOutAt: null,
    rescheduleCount: 0,
    lastRescheduledAt: null,
    createdAt: "2026-07-20T09:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z",
    projectName: "واحة الياسمين",
    projectCity: "الرياض",
    unitNumber: "A-1",
    notes: [],
    issues: [],
    feedback: null,
    ...over,
  };
}

describe("visits adapter", () => {
  it("maps every status onto the screen's three phases", () => {
    expect(phaseOf("SCHEDULED", false)).toBe("active");
    expect(phaseOf("CONFIRMED", false)).toBe("active");
    expect(phaseOf("CHECKED_IN", false)).toBe("active");
    expect(phaseOf("CHECKED_OUT", false)).toBe("rating");
    expect(phaseOf("CHECKED_OUT", true)).toBe("done");
    expect(phaseOf("COMPLETED", true)).toBe("done");
    expect(phaseOf("CANCELLED", false)).toBe("done");
  });

  it("mirrors the Backend's own eligibility rules rather than guessing them", () => {
    // visit.types.ts#assertReschedulable / assertInProgress / assertFeedbackEligible
    expect(canReschedule("CONFIRMED")).toBe(true);
    expect(canReschedule("CHECKED_IN")).toBe(false);
    expect(isLive("CHECKED_IN")).toBe(true);
    expect(isLive("CONFIRMED")).toBe(false);
    expect(canSubmitFeedback("CHECKED_OUT", false)).toBe(true);
    expect(canSubmitFeedback("CHECKED_OUT", true)).toBe(false);
    expect(canSubmitFeedback("CONFIRMED", false)).toBe(false);
  });

  it("builds the event log from real rows only", () => {
    const events = toVisitEvents(
      visitDto({
        status: "CHECKED_OUT",
        checkedInAt: "2026-08-01T07:00:00.000Z",
        checkedOutAt: "2026-08-01T08:00:00.000Z",
        notes: [{ id: "n1", text: "إضاءة ممتازة", photoUrl: null, createdAt: "2026-08-01T07:10:00.000Z" }],
        issues: [
          { id: "i1", category: "PLUMBING", description: "تسريب", photoUrl: "https://signed/x", createdAt: "2026-08-01T07:30:00.000Z" },
        ],
      }),
    );
    expect(events.map((e) => e.type)).toEqual(["start", "note", "issue", "finish"]);
    expect(events[1].min).toBe(10);
    expect(events[2].min).toBe(30);
    expect(events[2].detail).toBe("سباكة · تسريب");
    expect(events[2].photoUrl).toBe("https://signed/x");
    expect(events[3].min).toBe(60);
  });

  it("does not synthesize a 'started' event for a visit that never started", () => {
    expect(toVisitEvents(visitDto()).map((e) => e.type)).toEqual([]);
  });

  it("derives the whole view model from the server's status", () => {
    const vm = toVisitViewModel(visitDto({ status: "CHECKED_IN", checkedInAt: "2026-08-01T07:00:00.000Z" }));
    expect(vm.live).toBe(true);
    expect(vm.canCheckOut).toBe(true);
    expect(vm.canReschedule).toBe(false);
    expect(vm.canSubmitFeedback).toBe(false);
    expect(vm.projectName).toBe("واحة الياسمين");
  });

  it("buckets list items into the three tabs the screen renders", () => {
    const listItem = { ...visitDto(), projectName: "x", unitNumber: "1" };
    expect(toVisitListItemViewModel({ ...listItem, status: "CONFIRMED" }).bucket).toBe("upcoming");
    expect(toVisitListItemViewModel({ ...listItem, status: "CHECKED_OUT" }).bucket).toBe("completed");
    expect(toVisitListItemViewModel({ ...listItem, status: "CANCELLED" }).bucket).toBe("cancelled");
  });
});

/* ---------------------------------------------------------------- My Home */

function myHomeDto(over: Partial<MyHomeDto> = {}): MyHomeDto {
  return {
    ownershipId: "o1",
    startDate: "2022-03-12T00:00:00.000Z",
    handoverDate: "2022-03-12T00:00:00.000Z",
    unit: { id: "u1", number: "A-142", floor: 1, type: "شقة", status: "OCCUPIED", area: 180, bedrooms: 3, bathrooms: 2, parkingSpots: 1 },
    building: { id: "b1", name: "مبنى أ", number: "1" },
    project: { id: "p1", name: "مشروع تالا ريزيدنس", city: "الرياض", developerName: "شركة الأفق" },
    coverImage: { url: "https://cdn.test/facade.jpg", isPlaceholder: false },
    warranty: { isActive: true, endDate: "2032-03-12T00:00:00.000Z", daysRemaining: 2000 },
    reportsSummary: { available: true, openCount: 2, boundary: "ACTIVE" },
    ...over,
  };
}

describe("My Home adapter", () => {
  it("maps the DTO into the exact visual model the frozen screen reads", () => {
    const vm = toMyHomeViewModel(myHomeDto());
    expect(vm.unit).toMatchObject({ project: "مشروع تالا ريزيدنس", dev: "شركة الأفق", number: "A-142", city: "الرياض" });
    expect(vm.coverImageUrl).toBe("https://cdn.test/facade.jpg");
    expect(vm.reports).toEqual({ available: true, openCount: 2 });
  });

  it("reproduces the approved warranty chip verbatim while it is active", () => {
    expect(toWarrantyChip(myHomeDto()).label).toBe("الضمان ساري");
  });

  it("never claims a warranty that does not exist", () => {
    expect(toWarrantyChip(myHomeDto({ warranty: null })).state).toBe("absent");
    expect(toWarrantyChip(myHomeDto({ warranty: { isActive: false, endDate: "2020-01-01T00:00:00.000Z", daysRemaining: null } })).state).toBe("expired");
  });

  it("never fabricates a cover photo", () => {
    expect(toMyHomeViewModel(myHomeDto({ coverImage: { url: null, isPlaceholder: true } })).coverImageUrl).toBeNull();
  });

  it("derives the attention cards from real state only", () => {
    const home = toMyHomeViewModel(myHomeDto({ warranty: { isActive: true, endDate: "2026-08-20T00:00:00.000Z", daysRemaining: 21 } }));
    const items = toAttentionItems(home, [
      { statusGroup: "AWAITING_APPROVAL", reportNumber: 2418, problemText: "تسريب في المطبخ", id: "r1" } as ReportSummaryDto,
    ]);
    expect(items.map((i) => i.kind)).toEqual(["REPORT_AWAITING_APPROVAL", "WARRANTY_ENDING"]);
    expect(items[0].sub).toBe("بلاغ #2418 — تسريب في المطبخ");
    expect(items[1].title).toBe("الضمان ينتهي خلال 21 يوماً");
  });

  it("produces NO attention cards when there is nothing to attend to", () => {
    const home = toMyHomeViewModel(myHomeDto());
    expect(toAttentionItems(home, [])).toEqual([]);
  });

  it("projects real reports into the activity strip", () => {
    const now = new Date("2026-07-29T00:00:00.000Z");
    const events = toActivityEvents(
      [
        { statusGroup: "CLOSED", reportNumber: 1, problemText: "إنارة", closedAt: "2026-07-27T00:00:00.000Z", updatedAt: "", createdAt: "" } as unknown as ReportSummaryDto,
      ],
      now,
    );
    expect(events[0]).toEqual({ when: "قبل يومين", text: "تم إغلاق البلاغ #1 — إنارة", ok: true });
  });

  it("renders honest Arabic relative dates", () => {
    const now = new Date("2026-07-29T00:00:00.000Z");
    expect(relativeArabicDay("2026-07-29T00:00:00.000Z", now)).toBe("اليوم");
    expect(relativeArabicDay("2026-07-28T00:00:00.000Z", now)).toBe("أمس");
    expect(relativeArabicDay("2026-07-22T00:00:00.000Z", now)).toBe("قبل أسبوع");
  });
});

/* --------------------------------------------------------------- warranty */

function warrantyDto(over: Partial<WarrantyDto> = {}): WarrantyDto {
  return {
    id: "w1",
    unitId: "u1",
    startDate: "2022-03-12T00:00:00.000Z",
    endDate: "2032-03-12T00:00:00.000Z",
    coverage: "STANDARD",
    isActive: true,
    daysRemaining: 2680,
    rulesVersion: "2026-07-28.1",
    categories: [
      { key: "STRUCTURE", durationMonths: 120, excludedAlways: false, covered: true, periodEndDate: "2032-03-12T00:00:00.000Z", daysRemaining: 2680, reasonCode: "ACTIVE" },
      { key: "PLUMBING", durationMonths: 24, excludedAlways: false, covered: false, periodEndDate: "2024-03-12T00:00:00.000Z", daysRemaining: null, reasonCode: "EXPIRED" },
      { key: "ELECTRICAL", durationMonths: 24, excludedAlways: false, covered: true, periodEndDate: null, daysRemaining: 10, reasonCode: "ACTIVE" },
      { key: "DOORS_WINDOWS", durationMonths: 12, excludedAlways: false, covered: true, periodEndDate: null, daysRemaining: 5, reasonCode: "ACTIVE" },
      { key: "PAINT_FINISHING", durationMonths: 6, excludedAlways: false, covered: true, periodEndDate: null, daysRemaining: 2, reasonCode: "ACTIVE" },
      { key: "MISUSE_EXCLUSION", durationMonths: null, excludedAlways: true, covered: false, periodEndDate: null, daysRemaining: null, reasonCode: "EXCLUDED" },
    ],
    ...over,
  };
}

const STATIC_TONES = {
  structure: "ok", plumbing: "ok", electrical: "ok",
  doors: "warn", paint: "warn", misuse: "err",
} as const;

describe("warranty adapter", () => {
  it("joins all six approved cards onto the server's categories", () => {
    const vm = toWarrantyViewModel(warrantyDto(), { ...STATIC_TONES });
    expect(vm.categories.map((c) => c.id)).toEqual(["structure", "plumbing", "electrical", "doors", "paint", "misuse"]);
    expect(Object.keys(CARD_ID_TO_CATEGORY_KEY)).toHaveLength(6);
  });

  it("lets the SERVER's verdict override the card's editorial tone when coverage ended", () => {
    const vm = toWarrantyViewModel(warrantyDto(), { ...STATIC_TONES });
    // plumbing is editorially "ok" but the server says EXPIRED.
    expect(vm.categories.find((c) => c.id === "plumbing")!.tone).toBe("err");
    // doors is still covered, so its "تغطية محددة" classification survives.
    expect(vm.categories.find((c) => c.id === "doors")!.tone).toBe("warn");
    expect(vm.categories.find((c) => c.id === "misuse")!.tone).toBe("err");
  });

  it("formats the coverage period from the server's own durationMonths", () => {
    expect(formatCoveragePeriod(120, false)).toBe("10 سنوات من تاريخ الاستلام");
    expect(formatCoveragePeriod(24, false)).toBe("سنتان من تاريخ الاستلام");
    expect(formatCoveragePeriod(12, false)).toBe("سنة واحدة من تاريخ الاستلام");
    expect(formatCoveragePeriod(6, false)).toBe("6 أشهر من تاريخ الاستلام");
    expect(formatCoveragePeriod(null, true)).toBe("غير مشمول");
    expect(formatCoveragePeriod(null, false)).toBe("غير محدّدة");
  });

  it("reproduces the approved header from server-computed values", () => {
    const vm = toWarrantyViewModel(warrantyDto(), { ...STATIC_TONES });
    expect(vm.statusLabel).toBe("الضمان ساري");
    expect(vm.startDateLabel).toBe("12 مارس 2022");
    expect(vm.endDateLabel).toBe("12 مارس 2032");
    expect(formatRemaining(2680)).toBe("7 سنوات و4 أشهر");
    expect(formatRemaining(null)).toBe("—");
  });

  it("says the warranty ended when the server says it ended", () => {
    expect(toWarrantyViewModel(warrantyDto({ isActive: false, daysRemaining: null }), { ...STATIC_TONES }).statusLabel).toBe("انتهى الضمان");
  });

  it("toneFor is a pure projection of the server's category state", () => {
    expect(toneFor({ excludedAlways: true, covered: false } as never, "ok")).toBe("err");
    expect(toneFor({ excludedAlways: false, covered: false } as never, "ok")).toBe("err");
    expect(toneFor({ excludedAlways: false, covered: true } as never, "warn")).toBe("warn");
  });
});

/* ---------------------------------------------------------------- reports */

function reportDto(over: Partial<ReportSummaryDto> = {}): ReportSummaryDto {
  return {
    id: "r1",
    reportNumber: 2432,
    status: "AWAITING_OWNER_APPROVAL",
    statusGroup: "AWAITING_APPROVAL",
    category: "WINDOWS",
    categoryConfirmedByUser: true,
    priority: "MEDIUM",
    prioritySource: "AI",
    problemText: "عطل في نافذة غرفة النوم",
    homeownerNote: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    closedAt: null,
    reopenCount: 0,
    warranty: { verdict: "COVERED", reasonCode: "COVERED", categoryKey: "DOORS_WINDOWS", rulesVersion: "v", evaluatedAt: "", periodStart: null, periodEnd: null },
    sla: { dueAt: null, state: "ON_TIME", rulesVersion: "v" },
    location: { projectId: "p", projectName: "x", projectCity: "y", projectDistrict: null, buildingId: "b", buildingName: "n", buildingNumber: "1", unitId: "u", unitNumber: "A-1", unitFloor: 1 },
    homeowner: { id: "h", name: "مالك", phone: null, email: null },
    technician: null,
    repair: null,
    review: null,
    ai: { suggestedCategory: "WINDOWS", confidence: 88, problemText: "تلف في المفصلات", explanation: "شرح", provider: "openai", model: "gpt" },
    routing: { state: "ROUTED", reasonCode: null, attemptCount: 1, lastAttemptAt: null },
    photoCounts: { homeowner: 1, before: 0, after: 0 },
    interventionNeeded: false,
    interventionReasonCode: null,
    permissions: { canStart: false, canSubmitRepair: false, canApprove: true, canReopen: true },
    ...over,
  };
}

describe("reports adapter", () => {
  it("maps the canonical DTO onto the frozen row shape", () => {
    const vm = toReportViewModel(reportDto(), new Date("2026-07-29T00:00:00.000Z"));
    expect(vm).toMatchObject({
      number: "#2432",
      title: "عطل في نافذة غرفة النوم",
      date: "اليوم",
      category: "نوافذ",
      priority: "متوسطة",
      confidence: 88,
      warranty: "in",
      key: "waiting",
      text: "بانتظار موافقتك",
    });
  });

  it("takes permissions from the SERVER, never from the status", () => {
    const vm = toReportViewModel(reportDto({ permissions: { canStart: false, canSubmitRepair: false, canApprove: false, canReopen: false } }));
    // Same AWAITING_OWNER_APPROVAL status, but the server said no.
    expect(vm.statusGroup).toBe("AWAITING_APPROVAL");
    expect(vm.canApprove).toBe(false);
    expect(vm.canReopen).toBe(false);
  });

  it("keeps the AI block null for a manually-filed report", () => {
    const vm = toReportViewModel(reportDto({ ai: null, prioritySource: "MANUAL_DEFAULT" }));
    expect(vm.confidence).toBeNull();
    expect(vm.aiDescription).toBeNull();
    expect(vm.priorityIsAiDerived).toBe(false);
  });

  it("maps every status onto the approved eight-step ladder", () => {
    expect(stageOf(reportDto({ status: "ROUTING_PENDING", routing: { state: "PENDING", reasonCode: null, attemptCount: 0, lastAttemptAt: null } }))).toBe(0);
    expect(stageOf(reportDto({ status: "ROUTING_PENDING", routing: { state: "PENDING", reasonCode: null, attemptCount: 2, lastAttemptAt: null } }))).toBe(1);
    expect(stageOf(reportDto({ status: "ROUTED" }))).toBe(2);
    expect(stageOf(reportDto({ status: "IN_PROGRESS", photoCounts: { homeowner: 1, before: 0, after: 0 } }))).toBe(3);
    expect(stageOf(reportDto({ status: "IN_PROGRESS", photoCounts: { homeowner: 1, before: 2, after: 0 } }))).toBe(4);
    expect(stageOf(reportDto({ status: "AWAITING_OWNER_APPROVAL" }))).toBe(6);
    expect(stageOf(reportDto({ status: "CLOSED" }))).toBe(7);
  });

  it("maps every status group onto the four approved chips", () => {
    expect(statusPresentation("OPEN").key).toBe("open");
    expect(statusPresentation("IN_PROGRESS").key).toBe("inprogress");
    expect(statusPresentation("AWAITING_APPROVAL").key).toBe("waiting");
    expect(statusPresentation("CLOSED").key).toBe("closed");
  });

  it("treats only COVERED as inside the warranty", () => {
    expect(warrantyFlagOf("COVERED")).toBe("in");
    for (const verdict of ["NOT_COVERED", "NOT_CONFIGURED", "NO_WARRANTY", "NOT_EVALUATED_LEGACY"] as const) {
      expect(warrantyFlagOf(verdict)).toBe("out");
    }
  });

  it("explains each verdict specifically, from its real reason code", () => {
    expect(warrantyExplanationOf("NOT_COVERED", "PERIOD_EXPIRED", "سباكة")).toContain("انتهت فترة تغطية");
    expect(warrantyExplanationOf("NOT_COVERED", "CATEGORY_EXCLUDED", "سباكة")).toContain("مستثنى");
    expect(warrantyExplanationOf("NO_WARRANTY", "NO_WARRANTY_ON_UNIT", "سباكة")).toContain("لا يوجد ضمان مسجّل");
    expect(warrantyExplanationOf("NOT_EVALUATED_LEGACY", "LEGACY_IMPORT_NOT_EVALUATED", "سباكة")).toContain("سابق");
  });

  it("splits detail media by stage and keeps the signed URLs", () => {
    const detail: ReportDetailDto = {
      ...reportDto(),
      media: [
        { id: "m2", stage: "AFTER", url: "https://signed/after", mimeType: "image/jpeg", sortOrder: 1, createdAt: "" },
        { id: "m1", stage: "HOMEOWNER", url: "https://signed/home", mimeType: "image/jpeg", sortOrder: 0, createdAt: "" },
      ],
    };
    const vm = toReportDetailViewModel(detail);
    expect(vm.homeownerPhotos).toEqual(["https://signed/home"]);
    expect(vm.afterPhotos).toEqual(["https://signed/after"]);
    expect(vm.beforePhotos).toEqual([]);
    expect(vm.media[0].id).toBe("m1");
  });

  it("counts the four filter tiles from the same rows the list renders", () => {
    const counts = toStatusCounts([
      toReportViewModel(reportDto({ statusGroup: "OPEN" })),
      toReportViewModel(reportDto({ statusGroup: "OPEN" })),
      toReportViewModel(reportDto({ statusGroup: "CLOSED" })),
    ]);
    expect(counts).toEqual({ open: 2, inprogress: 0, waiting: 0, closed: 1 });
  });

  it("renders the canonical timeline in the approved register, and never hides an unknown event", () => {
    const vm = toTimelineViewModel([
      { id: "e1", type: "REPORT_CREATED", actorType: "HOMEOWNER", actorName: "مالك", metadata: null, createdAt: "" },
      { id: "e2", type: "SOME_FUTURE_EVENT", actorType: "SYSTEM", actorName: null, metadata: null, createdAt: "" },
    ]);
    expect(vm[0].label).toBe("تم إرسال البلاغ");
    // A real event the frontend does not recognize is still SHOWN — but it is
    // described in Arabic. Falling through to the raw enum (the previous
    // behaviour asserted here) printed `TECHNICIAN_ASSIGNED`,
    // `AI_ANALYSIS_RECORDED` and `WARRANTY_EVALUATED` at Arabic readers in
    // production, because those three real event types were simply missing
    // from the label map.
    expect(vm[1].label).toBe(TIMELINE_FALLBACK_LABEL);
    expect(vm[1].label).not.toMatch(/[A-Z_]{4,}/);
    // The event itself is not dropped: its type is still carried through for
    // anything that needs to branch on it.
    expect(vm[1].type).toBe("SOME_FUTURE_EVENT");
  });

  it("has an Arabic label for EVERY event type the Backend can emit", () => {
    // `prisma/schema.prisma#ReportTimelineEventType`, verbatim. A value added
    // to the Backend enum and not to the map is a raw enum in the Arabic UI.
    const BACKEND_EVENT_TYPES = [
      "REPORT_CREATED",
      "AI_ANALYSIS_RECORDED",
      "AI_ANALYSIS_UNAVAILABLE",
      "WARRANTY_EVALUATED",
      "ROUTING_PENDING_RECORDED",
      "TECHNICIAN_ASSIGNED",
      "ROUTING_RETRIED",
      "REPAIR_STARTED",
      "REPAIR_MEDIA_ADDED",
      "REPAIR_SUBMITTED",
      "HOMEOWNER_APPROVED",
      "HOMEOWNER_REOPENED",
      "REPORT_CLOSED",
      "REVIEW_SUBMITTED",
      "LEGACY_IMPORTED",
    ];

    for (const type of BACKEND_EVENT_TYPES) {
      const label = timelineLabelFor(type);
      expect(label, `${type} has no Arabic label`).not.toBe(TIMELINE_FALLBACK_LABEL);
      expect(label, `${type} rendered a machine enum`).not.toMatch(/[A-Z_]{4,}/);
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it("exposes the report's real location, warranty category and SLA to the screens", () => {
    // PM2 used to print the CATEGORY where the project name belongs and "—" for
    // a building, floor and unit the DTO has always carried.
    const vm = toReportViewModel(
      reportDto({
        category: "CRACKS",
        location: {
          projectId: "p1",
          projectName: "مشروع نسائم الرياض (عرض)",
          projectCity: "الرياض",
          projectDistrict: "حي النرجس",
          buildingId: "b1",
          buildingName: "المبنى أ",
          buildingNumber: "A",
          unitId: "u1",
          unitNumber: "A101",
          unitFloor: 1,
        },
        warranty: {
          verdict: "COVERED",
          reasonCode: "COVERED",
          categoryKey: "STRUCTURE",
          rulesVersion: "v1",
          evaluatedAt: "2026-07-01T00:00:00.000Z",
          periodStart: "2025-12-30T00:00:00.000Z",
          periodEnd: "2035-12-30T00:00:00.000Z",
        },
      }),
    );

    expect(vm.projectName).toBe("مشروع نسائم الرياض (عرض)");
    expect(vm.projectName).not.toBe(vm.category);
    expect(vm.buildingName).toBe("المبنى أ");
    expect(vm.unitNumber).toBe("A101");
    expect(vm.unitFloor).toBe(1);
    // The warranty CATEGORY, not the report category — a تشققات report is
    // covered under STRUCTURE and must never read as plumbing coverage.
    expect(vm.warrantyCategoryLabel).toBe("الهيكل الإنشائي");
    expect(vm.warrantyCategoryLabel).not.toBe("السباكة");
    expect(vm.slaLabel).not.toMatch(/[A-Z_]{4,}/);
  });
});
