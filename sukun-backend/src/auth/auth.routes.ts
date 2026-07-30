import { Router } from 'express';
import { authController } from './auth.controller';
import { validateBody } from '../shared/validateBody';
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware, optionalAuthMiddleware } from '../shared/auth.middleware';
import { requireAllowedOrigin } from '../shared/originGuard.middleware';
import { authRateLimiter } from '../shared/rateLimit.middleware';

export const authRouter = Router();

// Defense-in-depth alongside SEC-007's per-account lockout (see rateLimit.middleware.ts).
authRouter.use(authRateLimiter);

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a Home Seeker account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, phone, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       201: { description: Account created }
 *       400: { description: VALIDATION_ERROR }
 *       409: { description: EMAIL_ALREADY_EXISTS or PHONE_ALREADY_EXISTS }
 */
authRouter.post('/register', validateBody(registerSchema), asyncHandler(authController.register));

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate and receive JWT + refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Authenticated }
 *       401: { description: INVALID_CREDENTIALS or ACCOUNT_LOCKED }
 */
authRouter.post('/login', validateBody(loginSchema), asyncHandler(authController.login));

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the presented refresh token and clear the session cookie
 *     description: >
 *       Reads the httpOnly refresh cookie. An access token is accepted but not
 *       required: an expired one must still be able to end the session, or the
 *       refresh token would stay live and silently restore it. Requests
 *       carrying a browser Origin header are pinned to the configured
 *       FRONTEND_URL (CSRF boundary for the SameSite=None production cookie).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logged out }
 *       403: { description: ACCESS_DENIED (request origin not allowed) }
 */
// Task 10: `optionalAuthMiddleware` (not `authMiddleware`) so an expired
// access token still revokes the refresh cookie - see auth.service.logout.
// `requireAllowedOrigin` is the CSRF boundary that production's
// `SameSite=None` refresh cookie requires (shared/originGuard.middleware.ts).
authRouter.post(
  '/logout',
  requireAllowedOrigin,
  optionalAuthMiddleware,
  validateBody(logoutSchema),
  asyncHandler(authController.logout),
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate a refresh token for a new access/refresh token pair
 *     description: >
 *       Reads the httpOnly refresh cookie the browser sends automatically.
 *       Single-use - presenting an already-rotated token revokes every session
 *       for that user (replay detection). Requests carrying a browser Origin
 *       header are pinned to the configured FRONTEND_URL.
 *     responses:
 *       200: { description: New token pair issued }
 *       401: { description: INVALID_TOKEN }
 *       403: { description: ACCESS_DENIED (request origin not allowed) }
 */
authRouter.post(
  '/refresh',
  requireAllowedOrigin,
  validateBody(refreshSchema),
  asyncHandler(authController.refresh),
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Generic success (does not reveal whether the email exists) }
 */
authRouter.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword),
);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using a reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Password reset, all sessions revoked }
 *       400: { description: VALIDATION_ERROR (invalid or expired token) }
 */
authRouter.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  asyncHandler(authController.resetPassword),
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current session's resolved account state (role/landing route/status)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current session }
 *       401: { description: AUTH_REQUIRED, INVALID_TOKEN, or ACCOUNT_DEACTIVATED }
 */
authRouter.get('/me', authMiddleware, asyncHandler(authController.me));

/**
 * @openapi
 * /auth/invitations/accept:
 *   post:
 *     tags: [Auth]
 *     summary: Redeem a purpose-bound invitation token (currently technician activation) and set a password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Account activated, tokens issued }
 *       409: { description: INVALID_INVITATION_TOKEN, INVITATION_EXPIRED, or INVITATION_ALREADY_USED }
 */
authRouter.post(
  '/invitations/accept',
  validateBody(acceptInvitationSchema),
  asyncHandler(authController.acceptInvitation),
);
