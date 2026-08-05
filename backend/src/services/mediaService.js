const crypto = require('crypto');

const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const cloudinaryService = require('./cloudinaryService');

/**
 * CRUD over files stored in Cloudinary.
 *
 * The upload half is deliberately split across the network: the browser sends the file straight to
 * Cloudinary with a signature from this server, then calls back here to REGISTER what landed. That
 * keeps image bytes off the container entirely while still leaving us a record of every file — the
 * record being the whole point, since Cloudinary's public_id is the only handle that can delete or
 * replace one, and it cannot be parsed back out of a delivery URL.
 *
 * Delete is genuinely destructive and irreversible at Cloudinary's end. The row is soft-archived
 * (locked rule 1) but the file itself is gone, so callers must be sure — see destroy() below.
 */

const CLOUDINARY_API = 'https://api.cloudinary.com/v1_1';

/** Same canonical-params-plus-secret sha1 Cloudinary uses for every signed call. */
function sign(params) {
  const canonical = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(canonical + process.env.CLOUDINARY_API_SECRET)
    .digest('hex');
}

function assertConfigured() {
  if (!cloudinaryService.isConfigured()) {
    throw ApiError.badRequest(
      'Image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and ' +
        'CLOUDINARY_API_SECRET.'
    );
  }
}

/**
 * Records a file the browser has just uploaded.
 *
 * Takes only what Cloudinary returned rather than trusting a client-shaped object: a caller could
 * otherwise register a public_id belonging to someone else's file and then delete it.
 */
async function register(
  { publicId, url, kind = 'IMAGE', visibility = 'PUBLIC', folder, format, bytes, width, height, originalFilename, purpose, ownerType, ownerId },
  user
) {
  if (!publicId || !url) {
    throw ApiError.badRequest('publicId and url are required to register an asset');
  }

  // Upsert rather than create: Cloudinary reuses a public_id when an upload overwrites one, and a
  // duplicate-key error at that point would leave the file stored but unrecorded — the worst of
  // both, because nothing could then delete it.
  return prisma.mediaAsset.upsert({
    where: { publicId },
    create: {
      publicId,
      url,
      kind,
      visibility,
      folder: folder ?? '',
      format,
      bytes,
      width,
      height,
      originalFilename,
      purpose,
      ownerType,
      ownerId,
      uploadedById: user?.id ?? null,
    },
    update: {
      url,
      format,
      bytes,
      width,
      height,
      originalFilename,
      ownerType,
      ownerId,
      archived: false,
    },
  });
}

/** Attaches an already-registered asset to the row it ended up on, once that row has an id. */
async function attach(publicId, { ownerType, ownerId }) {
  const asset = await prisma.mediaAsset.findUnique({ where: { publicId } });

  if (!asset) throw ApiError.notFound(`No media asset recorded for ${publicId}`);

  return prisma.mediaAsset.update({ where: { publicId }, data: { ownerType, ownerId } });
}

async function list({ purpose, ownerType, ownerId, includeArchived = false } = {}) {
  const where = {};

  if (!includeArchived) where.archived = false;
  if (purpose) where.purpose = purpose;
  if (ownerType) where.ownerType = ownerType;
  if (ownerId) where.ownerId = ownerId;

  return prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' } });
}

/**
 * Deletes the file from Cloudinary and archives the record.
 *
 * Cloudinary first, database second, and not in a transaction — because there is no transaction
 * that spans both. If Cloudinary fails we stop and the row stays live, which is recoverable. Doing
 * it the other way round would archive the row while the file lived on, leaving a file nothing
 * knows how to remove.
 */
async function destroy(publicId) {
  assertConfigured();

  const asset = await prisma.mediaAsset.findUnique({ where: { publicId } });

  if (!asset) throw ApiError.notFound(`No media asset recorded for ${publicId}`);

  const timestamp = Math.floor(Date.now() / 1000);
  const resourceType = asset.kind === 'RAW' ? 'raw' : asset.kind.toLowerCase();

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: process.env.CLOUDINARY_API_KEY,
    signature: sign({ public_id: publicId, timestamp }),
  });

  const res = await fetch(
    `${CLOUDINARY_API}/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
    { method: 'POST', body }
  );
  const data = await res.json().catch(() => ({}));

  // "not found" is treated as success: the goal is that the file is gone, and it already is. Any
  // other failure is real and must not be swallowed, or the row would be archived while the file
  // stayed billable and readable.
  if (!res.ok || (data.result !== 'ok' && data.result !== 'not found')) {
    throw ApiError.badRequest(
      `Cloudinary refused to delete ${publicId}: ${data?.error?.message ?? data.result ?? res.status}`
    );
  }

  return prisma.mediaAsset.update({ where: { publicId }, data: { archived: true } });
}

/**
 * A time-limited URL for an AUTHENTICATED asset.
 *
 * Used by the private-document pass: passports and payment proofs are stored with authenticated
 * delivery, so their plain URL opens nothing and a caller that has already passed our own tenancy
 * check mints one of these instead.
 *
 * PUBLIC assets are returned as-is — signing one would imply a protection it does not have.
 */
function signedUrl(asset, { expiresInSeconds = 600 } = {}) {
  if (asset.visibility !== 'AUTHENTICATED') return asset.url;

  assertConfigured();

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const resourceType = asset.kind === 'RAW' ? 'raw' : asset.kind.toLowerCase();
  const toSign = `${expiresAt}${asset.publicId}`;

  const signature = crypto
    .createHash('sha256')
    .update(toSign + process.env.CLOUDINARY_API_SECRET)
    .digest('base64url');

  return (
    `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/authenticated/` +
    `s--${signature}--/${asset.publicId}${asset.format ? `.${asset.format}` : ''}?_a=${expiresAt}`
  );
}

module.exports = { register, attach, list, destroy, signedUrl };
