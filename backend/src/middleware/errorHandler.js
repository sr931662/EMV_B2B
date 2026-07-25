const fs = require('fs');

const ApiError = require('../utils/ApiError');

// Mounted last. Every thrown error lands here and leaves as clean JSON: { error: message }.
// Validation failures additionally carry `details` naming each bad field.
function errorHandler(err, req, res, next) {
  // multer writes the upload to disk before any handler runs, so a request that uploads a file
  // and then fails a precondition would leave an orphan behind. This is the one place every
  // failed request passes through, so the cleanup lives here.
  if (req?.file?.path) fs.rm(req.file.path, { force: true }, () => {});

  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  const details = err.details;

  // Translate the Prisma errors we can act on. P2002 is the unique-constraint race we
  // can lose even after an application-level existence check.
  if (err.code === 'P2002') {
    statusCode = 409;
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
    message = target ? `Already in use: ${target}` : 'Unique constraint violation';
  } else if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  } else if (err.code === 'P2003') {
    // FK constraint. Every relation is onDelete: Restrict by design (locked rule 1),
    // so this usually means someone attempted a hard delete instead of archiving.
    statusCode = 409;
    message = 'Operation blocked by a related record. Archive instead of deleting.';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
  }

  // Never leak internals on a 500 — log the real error, return something generic.
  if (statusCode >= 500) {
    console.error('[error]', err);
    message = 'Internal server error';
  }

  const body = { error: message };
  if (details) body.details = details;

  res.status(statusCode).json(body);
}

// 404 for unmatched routes, mounted just before errorHandler.
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = { errorHandler, notFoundHandler };
