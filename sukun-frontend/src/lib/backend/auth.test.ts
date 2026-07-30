import { beforeEach, describe, expect, it, vi } from "vitest";
import { backendAuth } from "./auth";
import { apiClient } from "./client";
import { getAccessToken, setAccessToken } from "./session";

function success<T>(data: T) {
  return new Response(JSON.stringify({ success: true, requestId: "r", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const SESSION_DTO = {
  userId: "u-1",
  displayName: "مالك وحدة",
  email: "owner@example.sa",
  phone: "0500000000",
  backendRole: "HOMEOWNER",
  role: "homeowner_active",
  accountStatus: "ACTIVE",
  landingRoute: "/home",
  accessToken: "access-token-1",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(() => success(SESSION_DTO));
  vi.stubGlobal("fetch", fetchMock);
});

function call(i = 0) {
  return { url: fetchMock.mock.calls[i][0] as string, init: fetchMock.mock.calls[i][1] as RequestInit };
}

describe("login request/response mapping", () => {
  it("POSTs {email, password} to the current /auth/login route", async () => {
    const session = await backendAuth.login({ email: "owner@example.sa", password: "Passw0rd" });

    const { url, init } = call();
    expect(url).toBe(`${apiClient.getBaseUrl()}/auth/login`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "owner@example.sa",
      password: "Passw0rd",
    });
    expect(init.credentials).toBe("include");
    expect(session.role).toBe("homeowner_active");
    expect(session.accessToken).toBe("access-token-1");
  });

  it("does not send anything resembling a refresh token in the login body", async () => {
    await backendAuth.login({ email: "a@b.sa", password: "x" });
    expect(call().init.body as string).not.toMatch(/refresh/i);
  });
});

describe("registration mapping", () => {
  it("POSTs {name, email, phone, password} to /auth/register", async () => {
    await backendAuth.register({
      name: "نورة",
      email: "n@example.sa",
      phone: "0512345678",
      password: "Passw0rd",
    });
    const { url, init } = call();
    expect(url).toBe(`${apiClient.getBaseUrl()}/auth/register`);
    expect(JSON.parse(init.body as string)).toEqual({
      name: "نورة",
      email: "n@example.sa",
      phone: "0512345678",
      password: "Passw0rd",
    });
  });
});

describe("cookie-authenticated endpoints", () => {
  it("refresh sends no body at all — the token travels only in the httpOnly cookie", async () => {
    await backendAuth.refresh();
    const { url, init } = call();
    expect(url).toBe(`${apiClient.getBaseUrl()}/auth/refresh`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("logout sends no body and still goes out when the access token has expired", async () => {
    // "Expired" from this client's point of view is simply: no token in memory.
    setAccessToken(null);
    await backendAuth.logout();
    const { url, init } = call();
    expect(url).toBe(`${apiClient.getBaseUrl()}/auth/logout`);
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("include");
    expect((init.headers as Headers).get("Authorization")).toBeNull();
  });

  it("forgot-password uses the real two-step route, not the superseded /auth/password-reset", async () => {
    await backendAuth.requestPasswordReset({ email: "a@b.sa" });
    expect(call().url).toBe(`${apiClient.getBaseUrl()}/auth/forgot-password`);
    expect(call().url).not.toContain("/auth/password-reset");
  });

  it("reset-password posts {token, newPassword}", async () => {
    await backendAuth.resetPassword({ token: "t", newPassword: "Passw0rd" });
    expect(call().url).toBe(`${apiClient.getBaseUrl()}/auth/reset-password`);
    expect(JSON.parse(call().init.body as string)).toEqual({ token: "t", newPassword: "Passw0rd" });
  });
});

describe("token custody", () => {
  it("the access token never reaches localStorage or sessionStorage", async () => {
    const session = await backendAuth.login({ email: "a@b.sa", password: "x" });
    setAccessToken(session.accessToken);

    expect(getAccessToken()).toBe("access-token-1");
    const dumped = JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    });
    expect(dumped).not.toContain("access-token-1");
    expect(window.localStorage.getItem("sakn_access_token")).toBeNull();
  });

  it("no refresh token is ever written to, or read from, JavaScript-visible storage", async () => {
    await backendAuth.refresh();
    expect(window.localStorage.getItem("sakn_refresh_token")).toBeNull();
    expect(window.sessionStorage.getItem("sakn_refresh_token")).toBeNull();
    // The cookie is httpOnly; nothing in this codebase reads document.cookie.
    expect(document.cookie).not.toContain("sakn_refresh_token");
  });
});
