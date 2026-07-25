const { z } = require('zod');
const { OTP_LENGTH } = require('./otp');

// Normalise emails before validating so "  Foo@EMV.com " and "foo@emv.com" are the
// same identity — User.email is unique and is the login handle.
const emailField = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Must be a valid email address'));

const passwordField = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt truncates past 72 bytes
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const otpField = z
  .string({ error: 'OTP is required' })
  .trim()
  .regex(new RegExp(`^[0-9]{${OTP_LENGTH}}$`), `OTP must be ${OTP_LENGTH} digits`);

const requiredText = (label, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal('').transform(() => undefined));

// Partner self-registration. businessEmail doubles as the login email (User.email):
// the registration form collects a single address, and PartnerProfile.businessEmail is
// the white-label contact shown on partner-branded quotes.
const registerPartnerSchema = z.object({
  companyName: requiredText('Company name'),
  companyLogo: optionalText(500), // path/URL; file upload arrives with the CMS step
  ownerName: requiredText('Owner name'),
  gstNumber: requiredText('GST number', 20),
  panNumber: optionalText(20),
  businessEmail: emailField,
  mobile: z
    .string({ error: 'Mobile is required' })
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'Mobile must be 7-15 digits, optionally prefixed with +'),
  officeAddress: requiredText('Office address', 500),
  city: requiredText('City'),
  state: requiredText('State'),
  country: requiredText('Country'),
  pincode: z
    .string({ error: 'Pincode is required' })
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/, 'Pincode must be 3-12 alphanumeric characters'),
  website: optionalText(500),
  password: passwordField,
});

const verifyOtpSchema = z.object({
  email: emailField,
  otp: otpField,
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: emailField,
});

const resetPasswordSchema = z.object({
  email: emailField,
  otp: otpField,
  newPassword: passwordField,
});

module.exports = {
  registerPartnerSchema,
  verifyOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
