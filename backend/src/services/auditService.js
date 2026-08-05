const prisma = require('../utils/prisma');

/**
 * Who changed what, when, and from what to what.
 *
 * Written as ERP-wide infrastructure, not a Library feature. `entityType` is a plain string, so
 * quotes, payments, visa requests and any future module record through this same service without
 * it changing.
 *
 * HOW IT IS MEANT TO BE CALLED
 *
 *   await prisma.$transaction(async (tx) => {
 *     const after = await tx.hotel.update({ where: { id }, data });
 *     await auditService.record(tx, {
 *       entityType: 'Hotel', entityId: id, action: 'UPDATE',
 *       before, after, actor: req.user, reason: req.body.reason,
 *     });
 *   });
 *
 * Inside the caller's transaction on purpose. An audit row committed separately from the change it
 * describes can end up recording something that was rolled back, or missing something that was not
 * — either way the log stops being evidence.
 */

/**
 * Never written to the log, whatever the caller passes.
 *
 * An audit trail is read by more people than the rows it describes — support, finance, whoever is
 * investigating an incident. Copying a password hash or a live OTP into it turns a safety feature
 * into a second place those secrets live.
 */
const REDACTED_FIELDS = new Set([
  'passwordHash',
  'password',
  'otpCode',
  'token',
  'tokenVersion',
  'refreshToken',
  'apiKey',
  'apiSecret',
  'signature',
  'smtpPass',
  'screenshotPath',
]);

const REDACTED = '[redacted]';

/**
 * Fields that change on every write and mean nothing to a reader.
 *
 * Without this every UPDATE would list `updatedAt` as a changed field, and a genuine one-field edit
 * would look like a two-field edit forever.
 */
const IGNORED_FIELDS = new Set(['updatedAt', 'searchText']);

/** Prisma Decimals and Dates do not survive JSON on their own; make them explicit and exact. */
function normalise(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // Decimal.js instances (Prisma money columns) — String() is exact, Number() is not.
  if (typeof value === 'object' && typeof value.toFixed === 'function' && !Array.isArray(value)) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v)]));
  }
  return value;
}

function redact(field, value) {
  return REDACTED_FIELDS.has(field) ? REDACTED : normalise(value);
}

/** Compares by normalised value, so a Decimal and its string form are not reported as a change. */
function hasChanged(a, b) {
  return JSON.stringify(normalise(a)) !== JSON.stringify(normalise(b));
}

/**
 * The diff.
 *
 * Returns only the fields that actually moved, and only those fields' values — never whole rows.
 * A log that stores two complete records per edit grows faster than the data it describes, and a
 * reader then has to diff it by eye.
 */
function diff(before, after) {
  const changedFields = [];
  const beforeChanged = {};
  const afterChanged = {};

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;

    const from = before?.[key];
    const to = after?.[key];

    if (!hasChanged(from, to)) continue;

    changedFields.push(key);
    beforeChanged[key] = redact(key, from);
    afterChanged[key] = redact(key, to);
  }

  return { changedFields, before: beforeChanged, after: afterChanged };
}

/**
 * Records one change.
 *
 * `client` is a transaction client from the caller. Passing the base `prisma` works but records
 * outside the change's transaction, which is only correct for actions that are not themselves
 * transactional.
 *
 * Returns null for an UPDATE that changed nothing — a no-op edit is not an event, and logging it
 * would bury the real changes.
 */
async function record(client, { entityType, entityId, action, before, after, actor, reason, ip }) {
  const isUpdate = action === 'UPDATE';
  const { changedFields, before: beforeChanged, after: afterChanged } = diff(before, after);

  if (isUpdate && changedFields.length === 0) return null;

  // For a create there is no before; for a delete/archive there is no meaningful after. Recording
  // the whole row on a create is worth it — it is the only place the original state exists.
  const beforePayload = action === 'CREATE' ? null : beforeChanged;
  const afterPayload =
    action === 'CREATE'
      ? Object.fromEntries(
          Object.entries(after ?? {})
            .filter(([k]) => !IGNORED_FIELDS.has(k))
            .map(([k, v]) => [k, redact(k, v)])
        )
      : afterChanged;

  return client.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      changedFields: action === 'CREATE' ? Object.keys(afterPayload) : changedFields,
      before: beforePayload,
      after: afterPayload,
      reason: reason ?? null,
      // Denormalised deliberately: a trail that goes blank when an employee is archived, or that
      // re-labels their past actions when they change role, is not a trail.
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: actor?.role ?? null,
      actorIp: ip ?? null,
    },
  });
}

/**
 * The history of one record, newest first.
 *
 * Paginated by default because a long-lived master row accumulates entries indefinitely, and the
 * caller almost always wants the recent ones.
 */
async function history(entityType, entityId, { limit = 50, offset = 0 } = {}) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    skip: offset,
  });
}

/** Cross-entity search — "everything this user changed", "every price change this month". */
async function search({ entityType, actorId, action, field, since, limit = 100 } = {}) {
  const where = {};

  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  // Possible only because changedFields is a real array column rather than buried in the JSON.
  if (field) where.changedFields = { has: field };
  if (since) where.createdAt = { gte: new Date(since) };

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
  });
}

module.exports = { record, history, search, diff, REDACTED_FIELDS, IGNORED_FIELDS };
