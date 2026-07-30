/**
 * Real mode (`NEXT_PUBLIC_DEMO_MODE` is not `"true"`): the current secure
 * session architecture, driven end to end against a stubbed `fetch`.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo/config", () => ({ DEMO_MODE: false }));

import { AuthProvider, useAuth } from "./AuthContext";
import { getAccessToken } from "@/lib/backend/session";
import { storeTokens } from "@/lib/api";

const SESSION = {
  userId: "u-1",
  displayName: "مالك وحدة",
  email: "owner@example.sa",
  phone: "0500000000",
  backendRole: "HOMEOWNER",
  role: "homeowner_active",
  accountStatus: "ACTIVE",
  landingRoute: "/home",
  accessToken: "access-1",
};

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, requestId: "r", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function errorEnvelope(status: number, errorCode: string) {
  return new Response(
    JSON.stringify({ success: false, requestId: "r", errorCode, message: "no" }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
let signOutRef: (() => Promise<void>) | null = null;

function Probe() {
  const { isHydrated, sessionRole, user, isDemoSession, homeownerActivated, ownerIntent, signOut } =
    useAuth();
  signOutRef = signOut;
  return (
    <div>
      <span data-testid="hydrated">{String(isHydrated)}</span>
      <span data-testid="role">{sessionRole}</span>
      <span data-testid="user">{user?.name ?? "-"}</span>
      <span data-testid="demo">{String(isDemoSession)}</span>
      <span data-testid="activated">{String(homeownerActivated)}</span>
      <span data-testid="intent">{String(ownerIntent)}</span>
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

function urlsCalled(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  signOutRef = null;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("silent session restoration", () => {
  it("restores a session on startup with exactly one POST /auth/refresh", async () => {
    fetchMock.mockImplementation(() => envelope(SESSION));
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("role").textContent).toBe("homeowner_active");
    expect(screen.getByTestId("user").textContent).toBe("مالك وحدة");
    expect(getAccessToken()).toBe("access-1");

    const refreshCalls = urlsCalled().filter((u) => u.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("adopts whichever of the six roles the server derived", async () => {
    fetchMock.mockImplementation(() =>
      envelope({ ...SESSION, backendRole: "HOME_SEEKER", role: "homeowner_pending" }),
    );
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("homeowner_pending"));
    // The mocked owner-intent bridge is inert in real mode.
    expect(screen.getByTestId("intent").textContent).toBe("false");
    expect(screen.getByTestId("activated").textContent).toBe("false");
  });

  it("returns to guest — with no stale user — when the refresh fails", async () => {
    fetchMock.mockImplementation(() => errorEnvelope(401, "INVALID_TOKEN"));
    renderAuth();

    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("role").textContent).toBe("guest");
    expect(screen.getByTestId("user").textContent).toBe("-");
    expect(getAccessToken()).toBeNull();
  });

  it("returns to guest when the network is unreachable, without surfacing an error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("role").textContent).toBe("guest");
  });

  it("does not report itself hydrated until the restore has settled", async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    renderAuth();

    expect(screen.getByTestId("hydrated").textContent).toBe("false");
    expect(screen.getByTestId("role").textContent).toBe("guest");

    await act(async () => {
      resolveFetch!(envelope(SESSION));
    });
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
  });
});

describe("logout", () => {
  it("calls the real endpoint and clears the session, even with no live access token", async () => {
    fetchMock.mockImplementation(() => envelope(SESSION));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("homeowner_active"));

    // Simulate an access token that expired while the tab sat idle: the client
    // holds nothing, but the refresh cookie the backend authenticates logout by
    // is still in the browser.
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => envelope({ loggedOut: true }));
    await act(async () => {
      await signOutRef!();
    });

    const logoutCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/auth/logout"));
    expect(logoutCall).toBeDefined();
    expect(logoutCall![1].credentials).toBe("include");
    expect(logoutCall![1].body).toBeUndefined();

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("guest"));
    expect(getAccessToken()).toBeNull();
    expect(screen.getByTestId("user").textContent).toBe("-");
  });

  it("still ends the local session when the server revoke fails", async () => {
    fetchMock.mockImplementation(() => envelope(SESSION));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("homeowner_active"));

    fetchMock.mockRejectedValue(new TypeError("offline"));
    await act(async () => {
      await signOutRef!();
    });

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("guest"));
    expect(getAccessToken()).toBeNull();
  });
});

describe("no localStorage session state in real mode", () => {
  it("writes nothing to localStorage across restore and logout", async () => {
    fetchMock.mockImplementation(() => envelope(SESSION));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("homeowner_active"));

    expect({ ...window.localStorage }).toEqual({});
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("access-1");

    fetchMock.mockImplementation(() => envelope({ loggedOut: true }));
    await act(async () => {
      await signOutRef!();
    });
    expect({ ...window.localStorage }).toEqual({});
  });

  it("ignores a stale localStorage session left behind by an earlier Demo Mode visit", async () => {
    window.localStorage.setItem("sakn_access_token", "demo-mode-session");
    window.localStorage.setItem("sakn_demo_session", "1");
    window.localStorage.setItem(
      "sakn_user",
      JSON.stringify({ id: "demo", name: "شركة عقارية (عرض تجريبي)", role: "COMPANY" }),
    );
    fetchMock.mockImplementation(() => errorEnvelope(401, "INVALID_TOKEN"));

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("hydrated").textContent).toBe("true"));
    expect(screen.getByTestId("role").textContent).toBe("guest");
    expect(screen.getByTestId("user").textContent).toBe("-");
    expect(screen.getByTestId("demo").textContent).toBe("false");
  });

  it("refuses to persist a token pair at all", () => {
    expect(() => storeTokens({ accessToken: "a", refreshToken: "b", expiresInSeconds: 900 })).toThrow(
      /Demo Mode only/,
    );
    expect(window.localStorage.getItem("sakn_access_token")).toBeNull();
    expect(window.localStorage.getItem("sakn_refresh_token")).toBeNull();
  });
});
