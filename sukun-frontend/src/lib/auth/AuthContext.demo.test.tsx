/**
 * Demo Mode (`NEXT_PUBLIC_DEMO_MODE=true`): the Showcase behaviour must be
 * completely independent of the real-auth internals introduced in Task 1 — no
 * silent restore, no backend call, the synthetic session and the six role
 * journeys exactly as before.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo/config", () => ({ DEMO_MODE: true }));

import { AuthProvider, useAuth } from "./AuthContext";
import { ALL_APP_ROLES, type AppRole } from "./roles";
import { getAccessToken } from "@/lib/backend/session";
import { storeTokens } from "@/lib/api";

let fetchMock: ReturnType<typeof vi.fn>;
let enterDemoRoleRef: ((role: AppRole) => void) | null = null;
let signOutRef: (() => Promise<void>) | null = null;

function Probe() {
  const { isHydrated, sessionRole, user, isDemoSession, enterDemoRole, signOut } = useAuth();
  enterDemoRoleRef = enterDemoRole;
  signOutRef = signOut;
  return (
    <div>
      <span data-testid="hydrated">{String(isHydrated)}</span>
      <span data-testid="role">{sessionRole}</span>
      <span data-testid="user">{user?.name ?? "-"}</span>
      <span data-testid="demo">{String(isDemoSession)}</span>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  enterDemoRoleRef = null;
  signOutRef = null;
  fetchMock = vi.fn().mockRejectedValue(new Error("Demo Mode must not call the backend"));
  vi.stubGlobal("fetch", fetchMock);
});

describe("Demo Mode independence", () => {
  it("hydrates synchronously with no network call at all", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("role").textContent).toBe("guest");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enters each of the six synthetic roles and reports the matching sessionRole", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));

    for (const role of ALL_APP_ROLES) {
      act(() => enterDemoRoleRef!(role));
      await waitFor(() => expect(screen.getByTestId("role").textContent).toBe(role));
      expect(screen.getByTestId("demo").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toContain("عرض تجريبي");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores exactly the synthetic session `storeDemoSession` writes — and no refresh token", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    act(() => enterDemoRoleRef!("homeowner_active"));

    expect(window.localStorage.getItem("sakn_access_token")).toBe("demo-mode-session");
    expect(window.localStorage.getItem("sakn_demo_session")).toBe("1");
    expect(window.localStorage.getItem("sakn_refresh_token")).toBeNull();
    expect(window.localStorage.getItem("sakn_homeowner_activated")).toBe("demo-homeowner");
    // The real in-memory access-token store stays empty — a demo session is not
    // a real credential and must never look like one to the API client.
    expect(getAccessToken()).toBeNull();
  });

  it("restores a stored demo session across a remount (hard refresh)", async () => {
    const { unmount } = renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    act(() => enterDemoRoleRef!("company"));
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("company"));
    unmount();

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("role").textContent).toBe("company");
    expect(screen.getByTestId("demo").textContent).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ends the demo session locally, still with no backend call", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    act(() => enterDemoRoleRef!("pm"));
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("pm"));

    await act(async () => {
      await signOutRef!();
    });

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("guest"));
    expect(window.localStorage.getItem("sakn_access_token")).toBeNull();
    expect(window.localStorage.getItem("sakn_demo_session")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the legacy token-pair helper working for the synthetic session", () => {
    expect(() =>
      storeTokens({ accessToken: "demo-mode-session", refreshToken: "x", expiresInSeconds: 900 }),
    ).not.toThrow();
    expect(window.localStorage.getItem("sakn_access_token")).toBe("demo-mode-session");
  });
});
