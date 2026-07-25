const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

// 6-digit numeric code + its expiry. crypto.randomInt (not Math.random) so codes
// are not predictable from prior codes.
function generateOtp() {
  const max = 10 ** OTP_LENGTH;
  const otpCode = String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, '0');
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  return { otpCode, otpExpiresAt };
}

function isOtpExpired(otpExpiresAt) {
  if (!otpExpiresAt) return true;
  return otpExpiresAt.getTime() < Date.now();
}

module.exports = { generateOtp, isOtpExpired, OTP_LENGTH, OTP_TTL_MINUTES };
