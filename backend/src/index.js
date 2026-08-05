require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const { validateEnv } = require('./utils/validateEnv');
const prisma = require('./utils/prisma');

// Before anything binds a port. A production task with a broken environment should die here, in
// the deploy log, rather than start and serve failures that look like application bugs.
validateEnv();

const app = express();

// Behind an ALB, every request arrives from the load balancer's private IP. Without this, req.ip
// and req.protocol describe the ALB rather than the client, which breaks anything that reasons
// about the caller's address or whether the original request was HTTPS.
app.set('trust proxy', 1);

// CORS_ORIGIN lets the deployed frontend origin be pinned instead of allowing every origin.
// Comma-separated for the "CloudFront domain plus a custom domain" case. Unset = allow all, which
// keeps local development and the existing behaviour unchanged.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : null;

/**
 * Security headers.
 *
 * contentSecurityPolicy is off: this process serves JSON, not HTML, so a CSP here protects nothing
 * — the SPA is served by Cloudflare Pages and needs its own. crossOriginResourcePolicy is relaxed
 * to cross-origin because the frontend lives on a different origin and would otherwise be blocked
 * from reading the very responses it is meant to consume.
 *
 * What this does buy: HSTS, X-Content-Type-Options, frame denial, and referrer trimming.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(cors(corsOrigins ? { origin: corsOrigins } : {}));
app.use(express.json({ limit: '1mb' }));

// Broad ceiling first, then the strict auth limit layered on top of /api/auth below.
app.use('/api', apiLimiter);

/**
 * Liveness. Deliberately does NOT touch the database: this is the ALB target-group health check,
 * and if it failed on a transient DB blip the ALB would kill and replace otherwise-healthy tasks,
 * turning a brief database hiccup into a full outage.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

/**
 * Readiness. This one DOES check the database, for humans and for deploy smoke tests — never wire
 * it to the ALB health check, for the reason above.
 */
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'up' });
  } catch (err) {
    // A suspended Neon compute is not "down" — it is asleep, and the next request wakes it. Saying
    // "down" here has sent people looking for an outage that was never happening.
    const asleep = prisma.isRetryable(err);

    res.status(503).json({
      status: 'not_ready',
      database: asleep ? 'waking' : 'down',
      retryable: asleep,
      error: err.message,
    });
  }
});

// Mounted before the router so it wraps every /api/auth/* path — login, registration, OTP verify
// and password reset are all credential-guessing surfaces, not just login.
app.use('/api/auth', authLimiter);

app.use('/api', routes);

// Order matters: unmatched route -> 404, then the global error handler must be last.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  // 0.0.0.0 rather than the default: inside a container, binding to localhost would make the port
  // unreachable from outside the container and every ALB health check would fail.
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`B2B EMV backend listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    console.log(`[email] transport = ${(process.env.EMAIL_TRANSPORT || 'console').toLowerCase()}`);

    // Neon suspends an idle branch, so the first query after a quiet spell has to wait for the
    // compute to boot. Doing it here means the wait is paid at startup — while ECS still has the
    // task out of the load balancer's rotation — instead of by whoever happens to click first.
    // Deliberately not awaited: the server must accept connections regardless.
    prisma.warmUp().then((ok) => {
      if (ok) console.log('[prisma] database awake');
    });
  });

  /**
   * Graceful shutdown. ECS sends SIGTERM and then waits (30s by default) before SIGKILL. Without
   * handling it, in-flight requests are severed mid-response on every deploy and Prisma's pool is
   * never drained, which shows up as 502s in the ALB during rollouts.
   */
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — draining connections`);

    // Stop accepting new connections, then wait for in-flight ones to finish.
    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log('[shutdown] prisma disconnected — exiting cleanly');
      } catch (err) {
        console.error('[shutdown] prisma disconnect failed:', err.message);
      }
      process.exit(0);
    });

    // Backstop: if a long-lived request never completes, exit anyway before ECS SIGKILLs us, so
    // the exit is still a clean one we control.
    setTimeout(() => {
      console.error('[shutdown] drain timed out after 20s — forcing exit');
      process.exit(1);
    }, 20_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
