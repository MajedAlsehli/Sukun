import { describe, expect, it } from "vitest";
import {
  ApiError,
  BackendErrorCode,
  NETWORK_ERROR_MESSAGE_AR,
  NetworkError,
  arabicMessageFor,
  isApiError,
  isNetworkError,
} from "./errors";

function apiError(code: string, message = "backend message", status = 400) {
  return new ApiError(code, message, status, "req-1");
}

describe("error-envelope mapping to Arabic copy", () => {
  it("maps every code the auth surfaces can produce", () => {
    const expectations: Array<[string, RegExp]> = [
      [BackendErrorCode.INVALID_CREDENTIALS, /بيانات الدخول غير صحيحة/],
      [BackendErrorCode.ACCOUNT_LOCKED, /قفل الحساب مؤقتاً/],
      [BackendErrorCode.ACCOUNT_DEACTIVATED, /غير نشط/],
      [BackendErrorCode.ACCESS_DENIED, /صلاحية/],
      [BackendErrorCode.EMAIL_ALREADY_EXISTS, /مسجّل مسبقاً/],
      [BackendErrorCode.PHONE_ALREADY_EXISTS, /مسجّل مسبقاً/],
      [BackendErrorCode.INVALID_TOKEN, /انتهت صلاحية الجلسة/],
      [BackendErrorCode.TOO_MANY_REQUESTS, /بعد قليل/],
      [BackendErrorCode.VALIDATION_ERROR, /تحقّق من البيانات/],
      [BackendErrorCode.SERVER_NOT_CONFIGURED, /غير متاحة حالياً/],
    ];
    for (const [code, pattern] of expectations) {
      expect(arabicMessageFor(apiError(code)), code).toMatch(pattern);
    }
  });

  it("never surfaces the backend's English message", () => {
    expect(arabicMessageFor(apiError(BackendErrorCode.INVALID_CREDENTIALS, "Invalid email or password"))).not.toContain(
      "Invalid email or password",
    );
  });

  it("falls back to one generic Arabic message for an unmapped code", () => {
    expect(arabicMessageFor(apiError("SOME_FUTURE_CODE"))).toMatch(/حدث خطأ غير متوقع/);
  });

  it("maps a transport failure to the network message", () => {
    expect(arabicMessageFor(new NetworkError(NETWORK_ERROR_MESSAGE_AR))).toBe(NETWORK_ERROR_MESSAGE_AR);
  });

  it("maps a non-Error throw to the generic message rather than crashing", () => {
    expect(arabicMessageFor("nope")).toMatch(/حدث خطأ غير متوقع/);
    expect(arabicMessageFor(undefined)).toMatch(/حدث خطأ غير متوقع/);
  });
});

describe("error type guards", () => {
  it("distinguishes an API error from a transport error", () => {
    const api = apiError(BackendErrorCode.NOT_FOUND, "x", 404);
    const net = new NetworkError("x");
    expect(isApiError(api)).toBe(true);
    expect(isApiError(net)).toBe(false);
    expect(isNetworkError(net)).toBe(true);
    expect(isNetworkError(api)).toBe(false);
  });

  it("carries requestId and status for diagnostics without leaking internals", () => {
    const err = apiError(BackendErrorCode.INTERNAL_SERVER_ERROR, "An unexpected error occurred.", 500);
    expect(err.httpStatus).toBe(500);
    expect(err.requestId).toBe("req-1");
    expect(err.stack ?? "").not.toContain("SELECT");
  });
});
