const asyncHandler = require('../utils/asyncHandler');
const cloudinaryService = require('../services/cloudinaryService');

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

module.exports = { getUploadConfig, createSignature };
