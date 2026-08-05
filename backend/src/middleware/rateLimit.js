const rateLimit = require('express-rate-limit');

/**
 * Rate limits.
 *
 * The one that matters is `authLimiter`. An OTP is six digits — a million combinations, and this
 * app lets a code stand for a full login. Without a limit an attacker walks the whole space in
 * minutes against any known email address; with one, the window closes long before they get
 * through a meaningful fraction of it.
 *
 * Keyed on IP, which is imperfect (shared offices collide, a determined attacker rotates) but is
 * the only identifier available before authentication. It raises the cost enough to matter and
 * costs a legitimate user nothing: nobody submits ten OTPs in fifteen minutes by accident.
 *
 * `app.set('trust proxy', 1)` in index.js is what makes the IP the real client rather than the
 * ALB's — without it every request would share one bucket and the limiter would lock out everyone
 * at once.
 */

// Skipped outside production so tests and local development are not throttled by their own speed.
const skipOutsideProduction = () => process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOutsideProduction,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});

/**
 * A broad ceiling for everything else — not a security control so much as a guard against a
 * runaway client or a scraper making the single Fargate task unavailable for real partners.
 * Deliberately generous: a partner working through a booking makes a lot of legitimate requests.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOutsideProduction,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
});

module.exports = { authLimiter, apiLimiter };
