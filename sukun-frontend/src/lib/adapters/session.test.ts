import { describe, expect, it } from "vitest";
import type { SessionResponseDto, SessionUserDto } from "@/lib/backend/auth";
import { SessionDtoError, assertSessionDto, toSessionViewModel, toSessionWithToken } from "./session";

function dto(overrides: Partial<SessionUserDto> = {}): SessionUserDto {
  return {
    userId: "u-1",
    displayName: "مالك وحدة",
    email: "owner@example.sa",
    phone: "0500000000",
    backendRole: "HOMEOWNER",
    role: "homeowner_active",
    accountStatus: "ACTIVE",
    landingRoute: "/home",
    ...overrides,
  };
}

describe("session role mapping", () => {
  const cases: Array<[SessionUserDto["backendRole"], SessionUserDto["role"]]> = [
    ["HOME_SEEKER", "homeowner_prospect"],
    ["HOME_SEEKER", "homeowner_pending"],
    ["HOMEOWNER", "homeowner_active"],
    ["TECHNICIAN", "technician"],
    ["PROJECT_MANAGER", "pm"],
    ["COMPANY", "company"],
  ];

  it.each(cases)("carries the server-derived role through untouched (%s -> %s)", (backendRole, role) => {
    const view = toSessionViewModel(dto({ backendRole, role }));
    expect(view.role).toBe(role);
    expect(view.user.role).toBe(backendRole);
  });

  it("never re-derives the role from the backend role", () => {
    // A HOME_SEEKER whose company has assigned them a unit resolves to
    // `homeowner_pending` server-side. Nothing on the client may downgrade that
    // to `homeowner_prospect` just because the backend role is HOME_SEEKER.
    const view = toSessionViewModel(dto({ backendRole: "HOME_SEEKER", role: "homeowner_pending" }));
    expect(view.role).toBe("homeowner_pending");
  });
});

describe("DTO -> view model field mapping", () => {
  it("renames the session fields onto the PublicUser shape the frozen screens read", () => {
    const view = toSessionViewModel(dto());
    expect(view.user).toEqual({
      id: "u-1",
      name: "مالك وحدة",
      email: "owner@example.sa",
      phone: "0500000000",
      role: "HOMEOWNER",
      status: "active",
    });
  });

  it("maps the backend's ARCHIVED deactivation onto the UI's 'inactive'", () => {
    expect(toSessionViewModel(dto({ accountStatus: "ARCHIVED" })).user.status).toBe("inactive");
  });

  it("keeps the backend landingRoute for diagnostics but exposes it separately from routing", () => {
    // `/home` here is the Vite app's path table; navigation uses
    // lib/auth/routeRoles.ts against this app's frozen SCREEN_PATHS instead.
    expect(toSessionViewModel(dto({ landingRoute: "/technician/tasks" })).backendLandingRoute).toBe(
      "/technician/tasks",
    );
  });
});

describe("validation", () => {
  it("accepts a well-formed DTO", () => {
    expect(() => assertSessionDto(dto())).not.toThrow();
  });

  it("rejects a role the route table does not understand", () => {
    expect(() => assertSessionDto(dto({ role: "admin" as never }))).toThrow(SessionDtoError);
  });

  it("rejects a missing userId or a non-object body", () => {
    expect(() => assertSessionDto(dto({ userId: "" }))).toThrow(SessionDtoError);
    expect(() => assertSessionDto(null)).toThrow(SessionDtoError);
    expect(() => assertSessionDto("nope")).toThrow(SessionDtoError);
  });

  it("tolerates an additive future field", () => {
    expect(() => assertSessionDto({ ...dto(), somethingNew: true } as never)).not.toThrow();
  });

  it("requires an access token on a session-producing response", () => {
    const withToken = { ...dto(), accessToken: "a" } as SessionResponseDto;
    expect(toSessionWithToken(withToken).accessToken).toBe("a");
    expect(() => toSessionWithToken(dto() as SessionResponseDto)).toThrow(SessionDtoError);
  });
});
