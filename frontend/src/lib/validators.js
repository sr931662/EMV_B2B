// Mirrors backend/src/utils/authSchemas.js so the client can reject obviously-bad input
// before a round trip — the backend remains the source of truth and re-validates everything.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MOBILE_RE = /^\+?[0-9]{7,15}$/;
export const PINCODE_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/;
// Mirrors backend/src/utils/quoteSchemas.js's contactNumber field (allows spaces/dashes, unlike MOBILE_RE).
export const CONTACT_NUMBER_RE = /^\+?[0-9][0-9 -]{6,19}$/;

export function isEmailValid(value) {
  return EMAIL_RE.test(value.trim());
}

export function isPasswordValid(pw) {
  return pw.length >= 8 && pw.length <= 72 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
}

export function passwordStrength(pw) {
  if (!pw) return { label: '', score: 0 };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';
  return { label, score };
}
