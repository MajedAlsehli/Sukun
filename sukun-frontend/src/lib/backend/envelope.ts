/**
 * The ONE parser for the Sakn Backend response envelope.
 *
 * Mirrors `sakn-backend/src/shared/response.ts` exactly — do not diverge from
 * that file without re-reading it:
 *
 *   success: { success: true,  requestId, data }
 *   error:   { success: false, requestId, errorCode, message, details? }
 *
 * `details` is optional and only present where an error deliberately opted in
 * (Task 8's `409 ACTIVE_REPAIR_EXISTS` names the blocking report). Every error
 * that does not set it keeps the three-field shape.
 */

export interface SaknSuccessEnvelope<T> {
  success: true;
  requestId?: string;
  data: T;
}

export interface SaknErrorEnvelope {
  success: false;
  requestId?: string;
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
}

export type SaknEnvelope<T> = SaknSuccessEnvelope<T> | SaknErrorEnvelope;

export function isSuccessEnvelope<T>(payload: unknown): payload is SaknSuccessEnvelope<T> {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as { success?: unknown }).success === true &&
    "data" in (payload as object)
  );
}

export function isErrorEnvelope(payload: unknown): payload is SaknErrorEnvelope {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as { success?: unknown }).success === false &&
    typeof (payload as { errorCode?: unknown }).errorCode === "string"
  );
}

/**
 * A paginated list, as every `page`/`pageSize`-shaped backend list endpoint
 * returns it. Declared here (rather than per-domain) so Task 2/3 domains share
 * one primitive instead of re-deriving it six times.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}
