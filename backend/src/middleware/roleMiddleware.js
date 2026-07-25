const ApiError = require('../utils/ApiError');

// Usage: roleMiddleware('admin')  |  roleMiddleware('admin', 'data_feeder')
// Must run after authMiddleware, which populates req.user.
function roleMiddleware(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error('roleMiddleware requires at least one role');
  }

  return (req, _res, next) => {
    if (!req.user) {
      // Programming error: roleMiddleware mounted without authMiddleware in front.
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Requires role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
        )
      );
    }

    return next();
  };
}

module.exports = roleMiddleware;
