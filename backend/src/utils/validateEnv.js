/**
 * Checks the environment at boot and refuses to start production on a broken one.
 *
 * The alternative is what this codebase kept hitting during development: a missing or wrong value
 * surfacing as a confusing runtime failure hours later — a CORS block that looked like a network
 * error, a P1001 that looked like a dead database, a JWT_SECRET whose absence only showed up when
 * someone tried to log in. Failing at startup turns all of those into one obvious line in the
 * deploy log, before any traffic arrives.
 *
 * Development is warned, never blocked: half-configured is the normal state of a dev machine.
 */

const PLACEHOLDER_MARKERS = [
  'replace_with',
  'replace-with',
  'REPLACE_WITH',
  'changeme',
  'your-',
  'yourdomain',
  'example.com',
];

function looksLikePlaceholder(value) {
  if (!value) return false;

  return PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker.toLowerCase()));
}

/** Collects every problem before reporting, so one restart surfaces all of them, not the first. */
function collectProblems() {
  const errors = [];
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // --- always required ---------------------------------------------------------------------
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set — the app cannot reach its database.');
  } else if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
    errors.push('DATABASE_URL must start with postgresql:// — Prisma rejects anything else.');
  } else if (process.env.DATABASE_URL.includes('pool_timeout')) {
    // Learned the hard way: the query engine accepts it, the schema engine does not, and every
    // `prisma migrate` then fails with a P1001 that looks like an unreachable database.
    warnings.push(
      'DATABASE_URL contains pool_timeout. Prisma\'s schema engine rejects it, so migrate/validate ' +
        'commands will fail with a misleading P1001. Remove it.'
    );
  }

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is not set — every authenticated request would fail.');
  } else if (isProduction) {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET is shorter than 32 characters — too weak to sign production tokens.');
    }
    if (/dev|local|test|changeme/i.test(process.env.JWT_SECRET)) {
      errors.push(
        'JWT_SECRET looks like a development value. A shared secret means a token minted on a ' +
          'laptop is valid in production.'
      );
    }
  }

  // --- production-only ---------------------------------------------------------------------
  if (isProduction) {
    if (!process.env.CORS_ORIGIN) {
      errors.push(
        'CORS_ORIGIN is not set. Unset means ALLOW ALL ORIGINS, which lets any site call this API ' +
          "with a logged-in user's browser."
      );
    } else {
      // The mistake that took a browser-console debugging session to find.
      const withSlash = process.env.CORS_ORIGIN.split(',').filter((o) => o.trim().endsWith('/'));

      if (withSlash.length > 0) {
        errors.push(
          `CORS_ORIGIN entries end with "/": ${withSlash.join(', ')}. Browsers never send a ` +
            'trailing slash in the Origin header, so these will never match and every request ' +
            'will be blocked.'
        );
      }
    }

    const transport = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();

    if (transport === 'console') {
      errors.push(
        'EMAIL_TRANSPORT is "console" in production — OTPs would be printed to the log instead of ' +
          'being sent, so nobody could register or reset a password.'
      );
    }

    if (transport === 'smtp') {
      ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].forEach((key) => {
        if (!process.env[key]) errors.push(`${key} is required when EMAIL_TRANSPORT=smtp.`);
      });

      if (looksLikePlaceholder(process.env.SMTP_PASS)) {
        errors.push('SMTP_PASS is still a placeholder — email authentication will fail.');
      }
    }

    if (transport === 'ses' && !process.env.SES_FROM_ADDRESS) {
      // emailService falls back to SMTP_FROM, which is almost never the verified SES identity.
      errors.push(
        'SES_FROM_ADDRESS is required when EMAIL_TRANSPORT=ses. Without it the sender silently ' +
          'falls back to SMTP_FROM, which SES will reject.'
      );
    }
  }

  // --- optional, but broken if half-set ------------------------------------------------------
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const cloudinarySet = cloudinaryKeys.filter((key) => process.env[key]);

  if (cloudinarySet.length > 0 && cloudinarySet.length < cloudinaryKeys.length) {
    errors.push(
      `Cloudinary is partly configured (${cloudinarySet.join(', ')}). Set all three or none — a ` +
        'partial config means uploads report as available and then fail.'
    );
  }

  return { errors, warnings };
}

/**
 * Throws in production, warns everywhere else.
 *
 * Called before the server binds a port, so a misconfigured task dies immediately and ECS reports
 * a failed deployment rather than serving broken traffic.
 */
function validateEnv({ exitOnError = true } = {}) {
  const { errors, warnings } = collectProblems();

  warnings.forEach((warning) => console.warn(`[config] ${warning}`));

  if (errors.length === 0) return { errors, warnings };

  const message = ['[config] Refusing to start — environment is not usable:']
    .concat(errors.map((e) => `  - ${e}`))
    .join('\n');

  if (process.env.NODE_ENV === 'production' && exitOnError) {
    console.error(message);
    process.exit(1);
  }

  // Outside production these are loud but not fatal: a dev machine is allowed to be half-set-up.
  console.warn(message.replace('Refusing to start', 'Configuration problems'));

  return { errors, warnings };
}

module.exports = { validateEnv, collectProblems, looksLikePlaceholder };
