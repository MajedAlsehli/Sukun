import { Request, Response } from 'express';
import { authService } from './auth.service';
import { invitationService } from './invitation.service';
import { sendSuccess } from '../shared/response';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from './refreshCookie';
import { ttlToDate } from './token.util';
import { env } from '../config/env';
import {
  AcceptInvitationDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { AuthenticationError } from '../shared/errors';

function readRefreshToken(req: Request, bodyToken?: string): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME] ?? bodyToken;
}

// Controllers: receive request -> validated DTO already attached -> call service -> respond.
// No business logic lives here (12_Backend_Implementation_Guide.md #CONTROLLER RESPONSIBILITIES).
// The refresh token is stripped out of every JSON body here and set as an
// httpOnly cookie instead - the service layer still hands it back as a plain
// value (simplest internal shape), the boundary that keeps it out of JS lives here.
export const authController = {
  async register(req: Request, res: Response) {
    const dto = req.body as RegisterDto;
    const { session, refreshToken } = await authService.register(dto, { ipAddress: req.ip ?? null });
    setRefreshCookie(res, refreshToken, ttlToDate(env.jwt.refreshTtl));
    sendSuccess(res, session, 201);
  },

  async login(req: Request, res: Response) {
    const dto = req.body as LoginDto;
    const { session, refreshToken } = await authService.login(dto, { ipAddress: req.ip ?? null });
    setRefreshCookie(res, refreshToken, ttlToDate(env.jwt.refreshTtl));
    sendSuccess(res, session);
  },

  // Task 10: authenticated by `optionalAuthMiddleware`, so an expired access
  // token still revokes the refresh cookie instead of 401-ing and leaving the
  // session silently restorable.
  async logout(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as LogoutDto;
    const refreshToken = readRefreshToken(req, dto.refreshToken);
    await authService.logout(refreshToken, req.user?.id, { ipAddress: req.ip ?? null });
    clearRefreshCookie(res);
    sendSuccess(res, { loggedOut: true });
  },

  async refresh(req: Request, res: Response) {
    const dto = req.body as RefreshDto;
    const refreshToken = readRefreshToken(req, dto.refreshToken);
    if (!refreshToken) {
      clearRefreshCookie(res);
      throw new AuthenticationError('Missing refresh token', 'INVALID_TOKEN');
    }
    const { session, refreshToken: nextRefreshToken } = await authService.refresh(refreshToken);
    setRefreshCookie(res, nextRefreshToken, ttlToDate(env.jwt.refreshTtl));
    sendSuccess(res, session);
  },

  async me(req: AuthenticatedRequest, res: Response) {
    const session = await authService.me(req.user!.id);
    sendSuccess(res, session);
  },

  async forgotPassword(req: Request, res: Response) {
    const dto = req.body as ForgotPasswordDto;
    await authService.forgotPassword(dto.email);
    // Always a generic success - never confirms whether the email exists.
    sendSuccess(res, { message: 'If the account exists, a reset link has been sent.' });
  },

  async resetPassword(req: Request, res: Response) {
    const dto = req.body as ResetPasswordDto;
    await authService.resetPassword(dto.token, dto.newPassword);
    sendSuccess(res, { message: 'Password has been reset.' });
  },

  async acceptInvitation(req: Request, res: Response) {
    const dto = req.body as AcceptInvitationDto;
    const { user, accessToken, refreshToken } = await invitationService.accept(
      dto.token,
      dto.password,
      { ipAddress: req.ip ?? null },
    );
    setRefreshCookie(res, refreshToken, ttlToDate(env.jwt.refreshTtl));
    // invitationService currently only supports TECHNICIAN_ACTIVATION - the
    // landing route is fixed accordingly (see decisions.md invitation-token note).
    sendSuccess(res, {
      userId: user.id,
      displayName: user.name,
      email: user.email,
      phone: user.phone,
      backendRole: user.role,
      role: 'technician',
      accountStatus: user.status,
      landingRoute: '/technician/tasks',
      accessToken,
    });
  },
};
