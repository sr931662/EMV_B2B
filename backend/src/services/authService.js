const prisma = require('../utils/prisma');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateOtp, isOtpExpired } = require('../utils/otp');
const { signJwt, buildTokenPayload, JWT_EXPIRES_IN } = require('../utils/jwt');
const emailService = require('./emailService');
const afterCommit = require('../utils/afterCommit');

// Everything we are willing to send back to a client. Deliberately omits passwordHash,
// otpCode and otpExpiresAt so they cannot leak through a careless spread.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isVerified: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Logs that an OTP was issued — and, OUTSIDE production, what it was.
 *
 * Printing the code is the fast dev loop: no inbox to check, no SMTP to configure. In production
 * it is an account-takeover hole. An OTP is a bearer credential, so anyone who can read the logs
 * (CloudWatch, a log aggregator, a support engineer scrolling for something else) can log in as
 * any user by pasting the code before it expires — no password needed.
 *
 * The line is kept in production without the code, because "an OTP was sent to this address at
 * this time" is genuinely useful when a user says they never received one.
 */
function logOtpIssued(purpose, email, otpCode, otpExpiresAt) {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(
    `[OTP] ${purpose} | email=${email} | code=${isProduction ? '[redacted]' : otpCode} | ` +
      `expires=${otpExpiresAt.toISOString()}`
  );
}

// The email send is best-effort (never throws) and runs after whatever DB write produced this OTP
// has already committed.
async function deliverOtp(purpose, templateName, email, otpCode, otpExpiresAt, extraVars = {}) {
  logOtpIssued(purpose, email, otpCode, otpExpiresAt);

  await afterCommit(
    () => emailService.sendTemplatedEmail(templateName, email, { ...extraVars, otp: otpCode }),
    { label: `${templateName} email` }
  );
}

function issueToken(user) {
  return { token: signJwt(buildTokenPayload(user)), expiresIn: JWT_EXPIRES_IN };
}

/**
 * Partner self-registration. Creates the User (role=partner, isVerified=false) and its
 * PartnerProfile in one transaction, so a half-registered partner can never exist.
 *
 * businessEmail doubles as the login email (User.email) — registration collects one
 * address, and PartnerProfile.businessEmail is also the white-label contact that appears
 * on partner-branded quotes.
 */
async function registerPartner(data) {
  const {
    password,
    businessEmail,
    companyName,
    companyLogo,
    ownerName,
    gstNumber,
    panNumber,
    mobile,
    officeAddress,
    city,
    state,
    country,
    pincode,
    website,
  } = data;

  const email = businessEmail;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const { otpCode, otpExpiresAt } = generateOtp();

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: 'partner',
        isVerified: false,
        otpCode,
        otpExpiresAt,
      },
      select: SAFE_USER_SELECT,
    });

    await tx.partnerProfile.create({
      data: {
        userId: created.id,
        companyName,
        companyLogo,
        ownerName,
        gstNumber,
        panNumber,
        businessEmail,
        mobile,
        officeAddress,
        city,
        state,
        country,
        pincode,
        website,
      },
    });

    return created;
  });

  await deliverOtp('partner registration', 'partner_welcome_otp', email, otpCode, otpExpiresAt, {
    companyName,
  });

  const withProfile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { ...SAFE_USER_SELECT, partnerProfile: true },
  });

  return withProfile;
}

/**
 * Consumes a pending OTP: marks the account verified, clears the OTP fields, returns a JWT
 * so the partner is logged in immediately after verifying.
 */
async function verifyOtp(email, otp) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) throw ApiError.badRequest('Invalid email or OTP');
  if (user.archived) throw ApiError.forbidden('This account has been deactivated');

  if (!user.otpCode) {
    throw ApiError.badRequest('No OTP is pending for this account. Request a new one.');
  }
  if (isOtpExpired(user.otpExpiresAt)) {
    throw ApiError.badRequest('OTP has expired. Request a new one.');
  }
  if (user.otpCode !== otp) {
    throw ApiError.badRequest('Invalid email or OTP');
  }

  // tokenVersion is selected because issueToken needs it, then dropped from the response —
  // it is internal session plumbing, not something a client should see.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, otpCode: null, otpExpiresAt: null },
    select: { ...SAFE_USER_SELECT, tokenVersion: true },
  });

  const { tokenVersion: _tokenVersion, ...safeUser } = updated;

  return { user: safeUser, ...issueToken(updated) };
}

/**
 * Password login. Check order is deliberate: the password is verified before we disclose
 * anything about the account's state, so account status is not probeable by a stranger.
 */
async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Same message for unknown-email and wrong-password, to avoid account enumeration.
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const passwordOk = await comparePassword(password, user.passwordHash);
  if (!passwordOk) throw ApiError.unauthorized('Invalid email or password');

  if (user.archived) throw ApiError.forbidden('This account has been deactivated');
  if (!user.isVerified) throw ApiError.forbidden('Please verify your account first');

  const safeUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
  };

  return { user: safeUser, ...issueToken(user) };
}

/**
 * Starts a password reset. Always resolves the same way whether or not the email exists —
 * a reset endpoint that 404s is an account-enumeration oracle.
 */
async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && !user.archived) {
    const { otpCode, otpExpiresAt } = generateOtp();
    await prisma.user.update({ where: { id: user.id }, data: { otpCode, otpExpiresAt } });
    await deliverOtp('password reset', 'partner_password_reset', email, otpCode, otpExpiresAt, {
      email,
    });
  }

  return { message: 'If that account exists, a reset OTP has been sent.' };
}

/**
 * Completes a password reset. Also marks the account verified: receiving the OTP proves
 * control of the mailbox, which is exactly what verification establishes.
 *
 * Bumps tokenVersion in the same write, so every JWT minted before this instant dies here.
 * That is the whole point of resetting a leaked password — the increment belongs at the
 * moment the password actually changes, not when the reset is merely requested, since
 * requesting one is unauthenticated and would otherwise let anyone log a user out.
 */
async function resetPassword(email, otp, newPassword) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) throw ApiError.badRequest('Invalid email or OTP');
  if (user.archived) throw ApiError.forbidden('This account has been deactivated');

  if (!user.otpCode) {
    throw ApiError.badRequest('No OTP is pending for this account. Request a new one.');
  }
  if (isOtpExpired(user.otpExpiresAt)) {
    throw ApiError.badRequest('OTP has expired. Request a new one.');
  }
  if (user.otpCode !== otp) {
    throw ApiError.badRequest('Invalid email or OTP');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      otpCode: null,
      otpExpiresAt: null,
      isVerified: true,
      tokenVersion: { increment: 1 },
    },
  });

  return { message: 'Password has been reset. You can now log in.' };
}

/**
 * Revokes every outstanding session for a user by bumping tokenVersion.
 *
 * Exposed for build step 3's admin CMS: archiving a user must also kill their live tokens.
 * authMiddleware already rejects archived users on its own, so this is defence in depth —
 * it keeps revocation correct even if the archived check is ever relaxed or the user is
 * later un-archived.
 */
async function incrementTokenVersion(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { id: true, email: true, tokenVersion: true },
  });
}

/**
 * Creates an admin or data_feeder directly — no OTP, verified on creation. Used by the
 * seed to bootstrap the first admin, and later by the admin CMS (build step 9).
 * Staff have no PartnerProfile.
 */
async function createStaffUser(data, role) {
  if (!['admin', 'data_feeder'].includes(role)) {
    throw ApiError.badRequest('createStaffUser only creates admin or data_feeder users');
  }

  const email = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: { email, passwordHash, role, isVerified: true },
    select: SAFE_USER_SELECT,
  });
}

/** Current user for GET /me, including the partner profile when there is one. */
async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...SAFE_USER_SELECT, partnerProfile: true },
  });

  if (!user) throw ApiError.notFound('User not found');

  return user;
}

module.exports = {
  registerPartner,
  verifyOtp,
  login,
  requestPasswordReset,
  resetPassword,
  incrementTokenVersion,
  createStaffUser,
  getCurrentUser,
  SAFE_USER_SELECT,
};
