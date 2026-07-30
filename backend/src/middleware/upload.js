const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ApiError = require('../utils/ApiError');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Payment proof is a phone screenshot or a bank PDF receipt. Nothing else is accepted.
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const PDF_ONLY_EXTENSIONS = ['.pdf'];
const PDF_ONLY_MIME_TYPES = ['application/pdf'];

function storageDir(relativeDir) {
  const abs = path.join(BACKEND_ROOT, relativeDir);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

/**
 * Single-file upload to disk under `relativeDir`.
 *
 * Returns a middleware that wraps multer so every failure mode arrives at the global error
 * handler as a clean 400 rather than multer's own error shape, and so a part-written file from
 * a size-limit abort is removed instead of being left behind.
 */
function uploadSingle(fieldName, relativeDir, options = {}) {
  const destination = storageDir(relativeDir);
  const allowedExtensions = options.allowedExtensions ?? ALLOWED_EXTENSIONS;
  const allowedMimeTypes = options.allowedMimeTypes ?? ALLOWED_MIME_TYPES;

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => {
      // Never trust the client's filename on disk — it can carry path separators, NUL bytes or
      // a second extension. Only the validated extension is kept.
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });

  const handler = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();

      // Both checks matter: the extension decides what lands on disk, and the declared MIME
      // type catches a mismatched pair. Neither proves the bytes are really an image — an
      // admin eyeballs the file anyway, and it is only ever served back as an attachment.
       if (!allowedExtensions.includes(ext)) {
         return cb(
           ApiError.badRequest(
             `Unsupported file type "${ext || 'none'}". Allowed: ${allowedExtensions.join(', ')}`
           )
         );
       }
       if (!allowedMimeTypes.includes(file.mimetype)) {
         return cb(
           ApiError.badRequest(
             `Unsupported content type "${file.mimetype}". Allowed: ${allowedMimeTypes.join(', ')}`
           )
         );
       }

      return cb(null, true);
    },
  }).single(fieldName);

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();

      // Clean up anything multer already wrote before failing.
      if (req.file?.path) fs.rm(req.file.path, { force: true }, () => {});

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            ApiError.badRequest(`File is larger than the ${MAX_BYTES / (1024 * 1024)}MB limit`)
          );
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(ApiError.badRequest(`Unexpected file field. Expected "${fieldName}"`));
        }
        return next(ApiError.badRequest(`Upload failed: ${err.message}`));
      }

      return next(err); // already an ApiError from fileFilter
    });
  };
}

/** Guard for routes where the file is mandatory. */
function requireFile(fieldName) {
  return (req, _res, next) => {
    if (!req.file) return next(ApiError.badRequest(`"${fieldName}" file is required`));
    return next();
  };
}

/** Relative-to-backend-root path for storing on the row (never an absolute path). */
function relativeUploadPath(file, relativeDir) {
  return path.join(relativeDir, path.basename(file.path)).split(path.sep).join('/');
}

module.exports = {
  uploadSingle,
  requireFile,
  relativeUploadPath,
  MAX_BYTES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  PDF_ONLY_EXTENSIONS,
  PDF_ONLY_MIME_TYPES,
};
