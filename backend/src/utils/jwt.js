const jwt = require('jsonwebtoken');
const ApiError = require('./ApiError');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  // Fail at boot rather than signing tokens with `undefined`.
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
}

function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token expired');
    }
    throw ApiError.unauthorized('Invalid token');
  }
}

// The claims we put in every token — kept in one place so authMiddleware and the
// services agree on shape.
//
// tokenVersion is what makes sessions revocable: authMiddleware compares the value baked
// in here against the live User row. Minting a token with `undefined` would silently 401
// every request, so require the caller to have actually selected the column.
function buildTokenPayload(user) {
  if (typeof user.tokenVersion !== 'number') {
    throw new Error(
      'buildTokenPayload requires a numeric user.tokenVersion — select it from the database'
    );
  }

  return {
    id: user.id,
    role: user.role,
    email: user.email,
    tokenVersion: user.tokenVersion,
  };
}

module.exports = { signJwt, verifyJwt, buildTokenPayload, JWT_EXPIRES_IN };
