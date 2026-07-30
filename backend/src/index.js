require('dotenv').config();
const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const prisma = require('./utils/prisma');

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

app.use(cors(corsOrigins ? { origin: corsOrigins } : {}));
app.use(express.json({ limit: '1mb' }));

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
    res.status(503).json({ status: 'not_ready', database: 'down', error: err.message });
  }
});

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
