/**
 * One typed error class for every non-2xx backend response, one for a transport
 * failure, and the Arabic message map the existing (frozen) UI renders.
 *
 * The Arabic strings here are *fallback* copy for surfaces that render
 * `error.message` directly. Screens that already own their own Arabic error
 * catalogue — `components/auth/AuthScreen.tsx`'s `LIERR`/`RGERR` tables — keep
 * using theirs; this map never replaces an approved on-screen string, it only
 * gives every other caller something honest to show instead of an English
 * backend message.
 */

/** Error codes this frontend maps deliberately. Anything else falls through to the generic message. */
export const BackendErrorCode = {
  // Authentication / session (sakn-backend/src/shared/errors.ts + auth.service.ts)
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_TOKEN: "INVALID_TOKEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
  ACCESS_DENIED: "ACCESS_DENIED",
  // Registration conflicts
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  PHONE_ALREADY_EXISTS: "PHONE_ALREADY_EXISTS",
  NATIONAL_ID_ALREADY_EXISTS: "NATIONAL_ID_ALREADY_EXISTS",
  // Invitations
  INVALID_INVITATION_TOKEN: "INVALID_INVITATION_TOKEN",
  INVITATION_EXPIRED: "INVITATION_EXPIRED",
  INVITATION_ALREADY_USED: "INVITATION_ALREADY_USED",
  // Generic
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  SERVER_NOT_CONFIGURED: "SERVER_NOT_CONFIGURED",
  // Client-side only — the body could not be parsed as an envelope at all.
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type BackendErrorCodeValue = (typeof BackendErrorCode)[keyof typeof BackendErrorCode];

/** Thrown for any non-2xx response. Carries the backend's own `errorCode`, never a stack or SQL. */
export class ApiError extends Error {
  readonly errorCode: string;
  readonly httpStatus: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    errorCode: string,
    message: string,
    httpStatus: number,
    requestId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
    this.details = details;
  }
}

/** Thrown when `fetch` itself rejects — offline, DNS failure, CORS refusal. Never a server response. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

export const NETWORK_ERROR_MESSAGE_AR =
  "تعذّر الاتصال بالخادم. يرجى التحقّق من الاتصال بالإنترنت والمحاولة مرة أخرى.";

const GENERIC_ERROR_MESSAGE_AR = "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";

/**
 * Arabic copy per backend error code. Wording follows the tone already used by
 * the approved screens (`AuthScreen`'s error banners, the shared empty/error
 * states) rather than introducing a new voice.
 */
const ARABIC_MESSAGES: Record<string, string> = {
  [BackendErrorCode.AUTH_REQUIRED]: "يلزم تسجيل الدخول للمتابعة.",
  [BackendErrorCode.INVALID_TOKEN]: "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.",
  [BackendErrorCode.INVALID_CREDENTIALS]:
    "بيانات الدخول غير صحيحة. تأكّد من البريد الإلكتروني وكلمة المرور وحاول مجدداً.",
  [BackendErrorCode.ACCOUNT_LOCKED]:
    "تم قفل الحساب مؤقتاً بعد عدة محاولات دخول فاشلة. حاول لاحقاً أو أعد تعيين كلمة المرور.",
  [BackendErrorCode.ACCOUNT_DEACTIVATED]: "هذا الحساب غير نشط حالياً.",
  [BackendErrorCode.ACCESS_DENIED]: "لا تملك صلاحية الوصول إلى هذا المحتوى.",
  [BackendErrorCode.EMAIL_ALREADY_EXISTS]: "هذا البريد مسجّل مسبقاً.",
  [BackendErrorCode.PHONE_ALREADY_EXISTS]: "هذا الرقم مسجّل مسبقاً.",
  [BackendErrorCode.NATIONAL_ID_ALREADY_EXISTS]: "رقم الهوية الوطنية مسجّل مسبقاً.",
  [BackendErrorCode.INVALID_INVITATION_TOKEN]: "رابط الدعوة غير صالح.",
  [BackendErrorCode.INVITATION_EXPIRED]: "انتهت صلاحية رابط الدعوة. اطلب رابطاً جديداً.",
  [BackendErrorCode.INVITATION_ALREADY_USED]: "تم استخدام رابط الدعوة مسبقاً.",
  [BackendErrorCode.VALIDATION_ERROR]: "تحقّق من البيانات المدخلة وحاول مجدداً.",
  [BackendErrorCode.NOT_FOUND]: "العنصر المطلوب غير موجود.",
  [BackendErrorCode.TOO_MANY_REQUESTS]: "عدد المحاولات كبير. يرجى المحاولة بعد قليل.",
  [BackendErrorCode.INTERNAL_SERVER_ERROR]: GENERIC_ERROR_MESSAGE_AR,
  [BackendErrorCode.SERVER_NOT_CONFIGURED]: "الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً.",
  [BackendErrorCode.UNKNOWN_ERROR]: GENERIC_ERROR_MESSAGE_AR,
};

/** The Arabic string to render for any thrown value. Never surfaces an English backend message. */
export function arabicMessageFor(err: unknown): string {
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE_AR;
  if (isApiError(err)) return ARABIC_MESSAGES[err.errorCode] ?? GENERIC_ERROR_MESSAGE_AR;
  return GENERIC_ERROR_MESSAGE_AR;
}
