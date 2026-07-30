// Error taxonomy per 12_Backend_Implementation_Guide.md #ERROR HANDLING
// Validation -> 400 | Authentication -> 401 | Authorization -> 403
// Business -> 409 | Unexpected -> 500 (SYS-017/018: never expose internals)

export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly errorCode: string;

  /**
   * Task 8: optional, small, structured, non-sensitive payload attached to an
   * error response. Added for C1's `409 ACTIVE_REPAIR_EXISTS`, which has to
   * name the blocking report so the technician can navigate to it rather than
   * being told only "you already have an active repair". Purely additive - the
   * envelope is unchanged for every error that does not set it.
   */
  details?: Record<string, unknown>;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly httpStatus = 400;
  readonly errorCode = 'VALIDATION_ERROR';
}

export class AuthenticationError extends AppError {
  readonly httpStatus = 401;
  readonly errorCode: string;

  constructor(message: string, errorCode = 'AUTH_REQUIRED') {
    super(message);
    this.errorCode = errorCode;
  }
}

export class AuthorizationError extends AppError {
  readonly httpStatus = 403;
  readonly errorCode = 'ACCESS_DENIED';
}

export class BusinessError extends AppError {
  readonly httpStatus = 409;
  readonly errorCode: string;

  constructor(message: string, errorCode: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

/**
 * Task 8: "this capability is not configured in this environment" - distinct
 * from a business-rule conflict (409). Used for the protected routing-retry
 * endpoint, where an unset ROUTING_RETRY_SECRET must read as "the service is
 * not available here", not as "your request conflicted with something".
 *
 * Deliberately NOT retrofitted onto the pre-existing
 * MEDIA_STORAGE_NOT_CONFIGURED / COVER_STORAGE_NOT_CONFIGURED errors (E7/G12),
 * which stay 409 - changing their status would be an undisclosed contract
 * change to already-shipped endpoints.
 */
export class ServiceUnavailableError extends AppError {
  readonly httpStatus = 503;
  readonly errorCode: string;

  constructor(message: string, errorCode: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

export class NotFoundError extends AppError {
  readonly httpStatus = 404;
  readonly errorCode: string;

  constructor(message: string, errorCode = 'NOT_FOUND') {
    super(message);
    this.errorCode = errorCode;
  }
}
