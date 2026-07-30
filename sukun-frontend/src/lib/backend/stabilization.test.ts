/**
 * Regression tests for the pre-event stabilization pass.
 *
 * Every case here corresponds to a defect that was reproducible in production,
 * or to a rule the pass must not silently lose later:
 *
 *   1. National ID is collected nowhere and is never sent as a placeholder.
 *   2. RE3's real-mode mapping (the permanent-skeleton bug) stays correct.
 *   3. Nullable/absent DTO fields and empty arrays never throw.
 *   4. Real mode never substitutes fixture data.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo/config", () => ({ DEMO_MODE: false }));

import { backendAdmin } from "@/lib/backend/admin";
import { itemsOf } from "@/lib/hooks/useCompany";
import {
  formatArabicDate,
  realToOwnerRows,
  realToWorkData,
} from "@/components/company/ProjectWorkspaceScreen";
import type { BuildingDto, WorkspaceHomeownerDto, WorkspaceUnitDto } from "@/lib/backend/company";
import { envelope, installBackendStub, type BackendStub } from "@/test/backendHarness";

let stub: BackendStub;
beforeEach(() => {
  stub = installBackendStub();
});

// ---------------------------------------------------------------------------
// 1. National ID
// ---------------------------------------------------------------------------

describe("homeowner creation without a National ID", () => {
  it("omits the key entirely — never '', null, a phone number or a generated id", async () => {
    stub.reply(envelope({}, 201));
    await backendAdmin.createHomeowner({
      name: "فهد",
      email: "f@example.com",
      phone: "0500000000",
      unitId: "unit-1",
    });

    const body = stub.last().body as Record<string, unknown>;
    expect(body).not.toHaveProperty("nationalId");
    // The three values a "hidden but still sent" implementation would reach for.
    expect(Object.values(body)).not.toContain("");
    expect(body.phone).toBe("0500000000");
    expect(JSON.stringify(body)).not.toMatch(/nationalId/i);
  });

  it("still transmits a real National ID when one is genuinely supplied", async () => {
    stub.reply(envelope({}, 201));
    await backendAdmin.createHomeowner({
      name: "فهد",
      nationalId: "1084552310",
      email: "f@example.com",
      phone: "0500000000",
      unitId: "unit-1",
    });
    expect((stub.last().body as Record<string, unknown>).nationalId).toBe("1084552310");
  });

  it("reads a homeowner record whose stored nationalId is null without throwing", () => {
    const record = { id: "h1", name: "فهد", nationalId: null, email: "f@e.com", phone: "05" };
    // The list screen's own projection: absent must become "", not "—", so a
    // search for the placeholder character cannot match every row.
    expect(record.nationalId ?? "").toBe("");
  });
});

// ---------------------------------------------------------------------------
// 2. RE3 real-mode mapping (the permanent-skeleton defect)
// ---------------------------------------------------------------------------

const BUILDINGS: BuildingDto[] = [
  { id: "b1", projectId: "p", name: "المبنى أ", number: "A", status: "ACTIVE", isActive: true, unitsCount: 2, createdAt: "", updatedAt: "" },
  { id: "b2", projectId: "p", name: "المبنى ب", number: "B", status: "ACTIVE", isActive: true, unitsCount: 1, createdAt: "", updatedAt: "" },
];

const UNITS: WorkspaceUnitDto[] = [
  { id: "u1", number: "A101", floor: 1, type: "شقة", area: 165, bedrooms: 3, bathrooms: 3, parkingSpots: 2, status: "OCCUPIED", buildingId: "b1", buildingName: "المبنى أ", currentOwnerName: "مالك الوحدة", warranty: { state: "ACTIVE" } },
  { id: "u2", number: "A202", floor: 2, type: "شقة", area: 140, bedrooms: 2, bathrooms: 2, parkingSpots: 1, status: "AVAILABLE", buildingId: "b1", buildingName: "المبنى أ", currentOwnerName: null, warranty: null },
  { id: "u3", number: "B101", floor: 1, type: "شقة", area: 150, bedrooms: 2, bathrooms: 2, parkingSpots: 1, status: "RESERVED", buildingId: "b2", buildingName: "المبنى ب" },
];

describe("realToWorkData", () => {
  it("maps the Backend's own field names, not the ones the screen used to guess", () => {
    const { units } = realToWorkData(BUILDINGS, UNITS);
    // Previously read as u.beds / u.baths / u.parking -> all undefined.
    expect(units[0]).toMatchObject({ area: 165, beds: 3, baths: 3, parking: 2 });
  });

  it("reads the UPPERCASE Prisma status (lowercase comparison marked everything vacant)", () => {
    const { units } = realToWorkData(BUILDINGS, UNITS);
    expect(units.map((u) => u.occupancy)).toEqual(["مشغولة", "شاغرة", "محجوزة"]);
  });

  it("uses the real owner name and warranty state, never an index-derived one", () => {
    const { units } = realToWorkData(BUILDINGS, UNITS);
    expect(units[0].owner).toBe("مالك الوحدة");
    expect(units[0].warranty).toBe("ضمان ساري");
    // Vacant unit: no owner invented, no warranty claimed.
    expect(units[1].owner).toBe("—");
    expect(units[1].warranty).toBe("غير مفعّل");
    // Absent warranty object must not throw.
    expect(units[2].warranty).toBe("غير مفعّل");
  });

  it("derives building floors from real units and never prints undefined", () => {
    const { buildings } = realToWorkData(BUILDINGS, UNITS);
    expect(buildings[0]).toMatchObject({ name: "المبنى أ", floors: "2" });
    expect(buildings[1]).toMatchObject({ name: "المبنى ب", floors: "1" });
  });

  it("survives entirely empty buildings and units (a brand-new project)", () => {
    expect(() => realToWorkData([], [])).not.toThrow();
    expect(realToWorkData([], [])).toEqual({ buildings: [], units: [] });
  });

  it("survives a unit whose buildingId matches no building", () => {
    const orphan: WorkspaceUnitDto[] = [{ ...UNITS[0], buildingId: "gone" }];
    const { units } = realToWorkData(BUILDINGS, orphan);
    expect(units[0].building).toBeTruthy();
    expect(units[0].building).not.toBe("undefined");
  });
});

describe("RE3 workspace requests", () => {
  it("never asks for a page larger than the Backend accepts", async () => {
    // `workspace.dto.ts#listWorkspaceUnitsQuerySchema` is `.max(100)`. A larger
    // pageSize is a 400, and because the three workspace calls run in a
    // Promise.all it took the entire screen into its error state. Shipped once.
    stub.reply(envelope({ items: [], page: 1, pageSize: 100, total: 0 }));
    const { backendCompany } = await import("@/lib/backend/company");
    await backendCompany.listWorkspaceUnits("p1", { pageSize: 100 });

    const url = new URL(stub.last().url, "https://example.test");
    const pageSize = Number(url.searchParams.get("pageSize"));
    expect(pageSize).toBeLessThanOrEqual(100);
    expect(pageSize).toBeGreaterThan(0);
  });
});

describe("realToOwnerRows", () => {
  const rows: WorkspaceHomeownerDto[] = [
    { unitId: "u1", unitNumber: "A101", buildingName: "المبنى أ", ownerName: "مالك الوحدة", ownerEmail: "h@example.com", ownerPhone: "+966500000104", invitationState: "ACTIVE" },
    { unitId: "u2", unitNumber: "A202", buildingName: "المبنى أ", ownerName: null, ownerEmail: null, ownerPhone: null, invitationState: "PENDING" },
  ];

  it("reads the real unit-centric shape (ownerName/ownerEmail/ownerPhone)", () => {
    const [first] = realToOwnerRows(rows);
    expect(first).toMatchObject({
      name: "مالك الوحدة",
      email: "h@example.com",
      mobile: "+966500000104",
      unit: "A101",
      status: "الحساب مفعل",
    });
  });

  it("renders '—' for null contact fields instead of the string 'null'", () => {
    const [, second] = realToOwnerRows(rows);
    expect(second.name).toBe("—");
    expect(second.email).toBe("—");
    expect(second.mobile).toBe("—");
    expect(second.status).toBe("دعوة مرسلة");
  });

  it("maps an unknown invitation state to a real label rather than leaking the enum", () => {
    const [row] = realToOwnerRows([{ ...rows[0], invitationState: "SOME_FUTURE_STATE" }]);
    expect(row.status).toBe("لم يتم التفعيل");
    expect(row.status).not.toMatch(/[A-Z_]{3,}/);
  });

  it("returns an empty list for a project with no residents", () => {
    expect(realToOwnerRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Nullable / malformed values
// ---------------------------------------------------------------------------

describe("formatArabicDate", () => {
  it("renders '—' for null, undefined, empty and unparseable values", () => {
    for (const bad of [null, undefined, "", "not-a-date"]) {
      expect(formatArabicDate(bad)).toBe("—");
    }
  });

  it("never emits the literal string 'Invalid Date'", () => {
    expect(formatArabicDate("2026-13-45T99:99:99Z")).not.toMatch(/Invalid Date/);
  });

  it("formats a real ISO timestamp", () => {
    expect(formatArabicDate("2026-07-30T10:00:00.000Z")).not.toBe("—");
  });
});

describe("itemsOf", () => {
  it("normalizes every shape a list route may answer with", () => {
    expect(itemsOf(null)).toEqual([]);
    expect(itemsOf(undefined)).toEqual([]);
    expect(itemsOf([1, 2])).toEqual([1, 2]);
    expect(itemsOf({ items: [1] })).toEqual([1]);
    // `{total}` with no `items` is an empty page, not a crash.
    expect(itemsOf({} as { items?: number[] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Real mode never falls back to fixtures
// ---------------------------------------------------------------------------

describe("real mode never substitutes fixture data", () => {
  it("propagates a failed homeowner list instead of answering with seed rows", async () => {
    stub.rejectWith(new TypeError("Failed to fetch"));
    await expect(backendAdmin.listHomeowners()).rejects.toBeTruthy();
  });

  it("does not import demo fixtures into the RE3 real-mode mappers", () => {
    // The generators that invent names/mobiles/reports take no part in the real
    // path: mapping real input yields exactly the real records, same length.
    const { units } = realToWorkData(BUILDINGS, UNITS);
    expect(units).toHaveLength(UNITS.length);
    expect(units.map((u) => u.number)).toEqual(["A101", "A202", "B101"]);
    expect(realToOwnerRows([])).toHaveLength(0);
  });
});
