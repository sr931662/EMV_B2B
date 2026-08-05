const asyncHandler = require('../utils/asyncHandler');
const cloudinaryService = require('../services/cloudinaryService');
const mediaService = require('../services/mediaService');

/**
 * Tells the client whether direct upload is available.
 *
 * Exists so the admin forms can decide what to render BEFORE anyone picks a file: with credentials
 * they show a file picker, without them they fall back to pasting a URL. Discovering it by letting
 * the first upload fail would be a worse way to find out.
 */
const getUploadConfig = asyncHandler(async (_req, res) => {
  res.status(200).json({ uploadsEnabled: cloudinaryService.isConfigured() });
});

const createSignature = asyncHandler(async (req, res) => {
  const signature = cloudinaryService.createUploadSignature(req.body.purpose);

  res.status(200).json({ upload: signature });
});

/** Called by the browser after Cloudinary accepts the file, with what Cloudinary returned. */
const registerAsset = asyncHandler(async (req, res) => {
  const asset = await mediaService.register(req.body, req.user);

  res.status(201).json({ message: 'Media registered', asset });
});

/** Points an already-uploaded asset at the row it ended up on, once that row exists. */
const attachAsset = asyncHandler(async (req, res) => {
  const asset = await mediaService.attach(req.params.publicId, req.body);

  res.status(200).json({ message: 'Media attached', asset });
});

const listAssets = asyncHandler(async (req, res) => {
  const assets = await mediaService.list(req.validatedQuery);

  res.status(200).json({ count: assets.length, assets });
});

/**
 * Deletes the file from Cloudinary. Irreversible there, unlike the soft-archive everywhere else in
 * this codebase — the row survives as a record, the file does not.
 */
const deleteAsset = asyncHandler(async (req, res) => {
  const asset = await mediaService.destroy(req.params.publicId);

  res.status(200).json({ message: 'Media deleted', asset });
});

module.exports = {
  getUploadConfig,
  createSignature,
  registerAsset,
  attachAsset,
  listAssets,
  deleteAsset,
};
