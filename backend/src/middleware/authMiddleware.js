const { verifyJwt } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const prisma = require('../utils/prisma');

// Verifies the Bearer token and attaches req.user = { id, role, email }.
//
// It also re-checks the user in the database on every request. A valid token alone is
// not enough: soft-delete (locked rule 1) is how accounts are deactivated, so an
// archived user must lose API access immediately rather than keeping it until their
// token expires. Same for a user whose verification was revoked.
const authMiddleware = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  const payload = verifyJwt(token); // throws 401 on invalid/expired

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      role: true,
      isVerified: true,
      archived: true,
      tokenVersion: true,
    },
  });

  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.archived) throw ApiError.unauthorized('Account has been deactivated');
  if (!user.isVerified) throw ApiError.unauthorized('Account is not verified');

  // Session revocation. A password reset (or an admin archiving the account) bumps
  // User.tokenVersion, which strands every token minted before that moment — including
  // tokens issued before this feature existed, which carry no tokenVersion claim at all.
  if (payload.tokenVersion !== user.tokenVersion) {
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  // Trust the database row, not the token, for role — so a role change takes effect
  // without waiting for the token to expire.
  req.user = { id: user.id, role: user.role, email: user.email };
  next();
});

module.exports = authMiddleware;
