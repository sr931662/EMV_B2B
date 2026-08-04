const crypto = require('crypto');

const ApiError = require('../utils/ApiError');

/**
 * Signed direct-to-Cloudinary uploads.
 *
 * The browser sends the file STRAIGHT to Cloudinary; this server only ever produces a short-lived
 * signature. Three reasons that shape is worth the extra endpoint:
 *
 *   1. Image bytes never touch our container. Uploading through the API would write them to the
 *      ephemeral ECS disk (or hold them in memory) before forwarding — the exact problem the URL
 *      approach was avoiding, just moved.
 *   2. The API secret stays server-side. An unsigned/"upload preset" flow would put a credential in
 *      the browser bundle, where anyone can read it and upload to the account.
 *   3. No SDK. The signature is a sha1 of sorted params — implementing it costs a dozen lines and
 *      keeps the dependency list where it is.
 *
 * Deliberately NOT a general file endpoint: `folder` is chosen here, not by the caller, so a signed
 * request cannot be replayed to scatter files across the account.
 */

// Where uploads land, keyed by what they are for. The client picks a key, never a path — a
// client-supplied folder would let a signed request write anywhere in the account.
const UPLOAD_FOLDERS = {
  visaCountry: 'travnexa/visa-countries',
  packageHotel: 'travnexa/hotels',
  packageDay: 'travnexa/itinerary-days',
  packageGallery: 'travnexa/packages',
};

/**
 * Whether uploads are wired up at all.
 *
 * Checked rather than assumed because the credentials are genuinely optional: the admin forms fall
 * back to pasting a URL when this returns false, so the app is fully usable before anyone has a
 * Cloudinary account. Failing hard here would break image fields that used to work.
 */
function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Cloudinary's signature: every signed param sorted by key, joined as `k=v&k=v`, with the API
 * secret appended, then sha1. The secret is NOT part of the query string — it is only mixed into
 * the hash, which is what keeps it off the wire.
 */
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

/**
 * Everything the browser needs for one upload.
 *
 * The timestamp is what bounds it: Cloudinary rejects a signature whose timestamp is more than an
 * hour old, so a leaked response stops being useful on its own.
 */
function createUploadSignature(purpose) {
  if (!isConfigured()) {
    throw ApiError.badRequest(
      'Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and ' +
        'CLOUDINARY_API_SECRET, or paste an image URL instead.'
    );
  }

  const folder = UPLOAD_FOLDERS[purpose];

  if (!folder) {
    throw ApiError.badRequest(
      `Unknown upload purpose "${purpose}". Valid values: ${Object.keys(UPLOAD_FOLDERS).join(', ')}`
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = { folder, timestamp };

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature: sign(signedParams),
    // The browser posts here. Included so the client has no Cloudinary URL of its own to keep in
    // step with the cloud name.
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
  };
}

module.exports = { isConfigured, createUploadSignature, UPLOAD_FOLDERS };
