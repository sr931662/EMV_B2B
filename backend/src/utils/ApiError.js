// Error carrying an HTTP status. Anything thrown in a route/service is caught by
// asyncHandler and rendered by the global error handler — no try/catch per route.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    if (details) this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
