import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { requestIdMiddleware } from './shared/requestId.middleware';
import { requestLoggerMiddleware } from './shared/requestLogger.middleware';
import { errorMiddleware } from './shared/error.middleware';
import { authRouter } from './auth/auth.routes';
import { searchJourneyRouter } from './search-journeys/search-journey.routes';
import { projectRouter } from './projects/project.routes';
import { buildingRouter, projectBuildingsRouter } from './buildings/building.routes';
import { buildingUnitsRouter, unitRouter } from './units/unit.routes';
import { visitRouter } from './visits/visit.routes';
import { discoveryRouter } from './discovery/discovery.routes';
import { fileRouter } from './files/file.routes';
import { inspectionReportRouter } from './inspection-reports/inspection-report.routes';
import { technicianRouter } from './technicians/technician.routes';
import { repairRouter } from './repairs/repair.routes';
import { reportRouter, technicianTaskRouter } from './reports/report.routes';
import { pmRouter } from './pm/pm.routes';
import { homeownerRouter } from './homeowners/homeowner.routes';
import { warrantyRouter, warrantyReportRouter } from './warranty/warranty.routes';
import { notificationRouter } from './notifications/notification.routes';
import { auditRouter } from './audit/audit.routes';
import { contractorRouter } from './contractors/contractor.routes';
import { managerRouter } from './project-managers/project-manager.routes';
import { companyOverviewRouter } from './company/company.routes';
import {
  companyDashboardRouter,
  pmDashboardRouter,
  technicianDashboardRouter,
  homeownerDashboardRouter,
} from './dashboards/dashboard.routes';
import { swaggerSpec } from './docs/swagger';
import { collectConfigurationErrors, configurationReport, env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './shared/logger';

export function createApp() {
  const app = express();

  // Task 10: a production instance with incomplete configuration answers ONE
  // controlled 503 on every route, naming the variable classes that are
  // missing but never their values. It does not boot into a half-working state
  // that looks healthy, and it does not leak a stack trace. `/health` stays
  // reachable so a platform health check can still see the process is alive.
  const configurationErrors = collectConfigurationErrors();
  if (configurationErrors.length > 0) {
    logger.error('Refusing to serve traffic - production configuration is incomplete', {
      missing: configurationErrors,
    });
  }

  app.use(helmet());
  // credentials:true + an explicit exact-origin ALLOWLIST (never '*') -
  // required for the browser to send/accept the httpOnly refresh-token cookie
  // cross-port in dev and cross-origin in production (see auth/refreshCookie.ts).
  //
  // `env.frontendUrls` is `FRONTEND_URL` plus every valid entry of the optional
  // `FRONTEND_URLS` (config/env.ts). Passing the array rather than a string
  // makes `cors` compare the request's Origin by exact string equality and
  // reflect back ONLY the one that matched, with `Vary: Origin` - so a foreign
  // origin, and any deceptive suffix/prefix of an allowed one, receives no
  // `Access-Control-Allow-Origin` header at all. A request with no Origin
  // header (server-to-server, curl, the cron runner) is served exactly as
  // before; CORS is a browser rule, never this API's authorization.
  app.use(cors({ origin: env.frontendUrls, credentials: true }));
  // Raised above default 100kb: file uploads carry base64 content in the JSON
  // body (see files/file.dto.ts's ~20MB decoded cap).
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // Liveness: process is up, no dependency checks. Deliberately answered even
  // when configuration is incomplete - "the process is running but misconfigured"
  // is exactly what an operator needs to be able to observe.
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      configured: configurationErrors.length === 0,
    });
  });

  // Task 10: the misconfiguration gate. Everything below it is refused with a
  // named, actionable 503 instead of failing deep inside a request handler.
  if (configurationErrors.length > 0) {
    app.use((_req, res) => {
      res.status(503).json({
        success: false,
        errorCode: 'SERVER_NOT_CONFIGURED',
        message:
          'This deployment is missing required environment configuration and is not serving traffic.',
        details: { missing: configurationErrors },
      });
    });
    return app;
  }

  // Readiness: process is up AND the database is actually reachable - the
  // check orchestrators (k8s, load balancers) should use before routing
  // traffic. Fails gracefully (503, not a crash) when DATABASE_URL is unset.
  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', database: 'connected' });
    } catch (err) {
      logger.warn('Readiness check failed - database unreachable', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
  });

  // Task 10: Swagger is a complete map of the API surface, including every
  // route an attacker would otherwise have to discover. It stays open in
  // development. In production it is served only when SWAGGER_ENABLED=true,
  // and only to a caller presenting SWAGGER_TOKEN when one is configured.
  if (env.docs.swaggerEnabled) {
    app.use(
      '/docs',
      (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (!env.docs.swaggerToken) return next();
        const provided =
          (typeof req.query.token === 'string' ? req.query.token : undefined) ??
          (typeof req.headers['x-docs-token'] === 'string' ? req.headers['x-docs-token'] : undefined);
        if (provided === env.docs.swaggerToken) return next();
        res.status(404).end();
      },
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec),
    );
  } else {
    // 404, not 403: an absent surface should look absent.
    app.get('/docs', (_req, res) => res.status(404).end());
  }

  // Task 10: which optional providers are genuinely configured. Booleans and
  // descriptions only - never a value, never a key, never a connection string.
  // Unauthenticated on purpose: it is the honest-unavailable contract the
  // frontend and the operator both need, and it reveals nothing usable.
  app.get('/health/config', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      nodeEnv: env.nodeEnv,
      // The effective per-IP auth limiter policy. Not a secret - the limiter
      // already publishes exactly this in the `RateLimit-Policy` response
      // header on every auth request (standardHeaders: true). Reported here so
      // "what is production actually running?" is answerable without having to
      // provoke a rate-limited response to read the header off it.
      authRateLimit: {
        max: env.authRateLimit.max,
        windowMinutes: env.authRateLimit.windowMinutes,
        enabled: true,
      },
      providers: configurationReport().map(({ name, configured, required, note }) => ({
        name,
        configured,
        required,
        note,
      })),
    });
  });

  // Serves uploaded files back out at the `url` returned by /api/files/upload,
  // and (Task 8, decisions.md I11) the non-durable test media driver's objects.
  //
  // `helmet()` sets `Cross-Origin-Resource-Policy: same-origin` globally, which
  // makes a browser BLOCK these bytes whenever the app is served from a
  // different origin than the API - which it always is in dev (5173/5174 vs
  // 4000), and can be in production too. Found via the Task 8 browser
  // verification pass: the <img> elements were in the DOM but rendered broken
  // with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin.
  //
  // Relaxed to `cross-origin` for THIS mount only. It is not a new exposure:
  // these paths are already unauthenticated static reads (any origin could
  // fetch them server-side regardless) - CORP only governs whether a browser
  // will render them in a cross-origin document. Every other route keeps
  // helmet's default.
  app.use(
    '/files',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(env.storage.root),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/search-journey', searchJourneyRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/projects/:projectId/buildings', projectBuildingsRouter);
  app.use('/api/buildings/:buildingId/units', buildingUnitsRouter);
  app.use('/api/buildings', buildingRouter);
  app.use('/api/units', unitRouter);
  app.use('/api/visits', visitRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/files', fileRouter);
  app.use('/api/inspection-reports', inspectionReportRouter);
  app.use('/api/technicians', technicianRouter);
  app.use('/api/repairs', repairRouter);
  // Task 8 (decisions.md I0 #10): the canonical post-ownership report API for
  // H8/H9/C1/C2/C3/PM2. `/api/warranty-reports` below is the superseded legacy
  // surface, kept working unchanged for backward compatibility (I3).
  app.use('/api/reports', reportRouter);
  app.use('/api/homeowners', homeownerRouter);
  app.use('/api/warranty-reports', warrantyReportRouter);
  app.use('/api/warranty', warrantyRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/contractors', contractorRouter);
  app.use('/api/managers', managerRouter);
  app.use('/api/company', companyDashboardRouter);
  app.use('/api/company', companyOverviewRouter);
  // Task 9 (decisions.md J1): the granular PM operations API. Mounted BEFORE the
  // legacy monolithic PM dashboard router so the new canonical routes take
  // precedence; the legacy `/api/pm/dashboard` keeps working untouched and is
  // marked deprecated in Swagger only.
  app.use('/api/pm', pmRouter);
  app.use('/api/pm', pmDashboardRouter);
  app.use('/api/technician', technicianTaskRouter);
  app.use('/api/technician', technicianDashboardRouter);
  app.use('/api/homeowner', homeownerDashboardRouter);

  // Must be registered last: Express routes errors here from asyncHandler/next(err).
  app.use(errorMiddleware);

  return app;
}
