const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');

// Controllers stay thin: bodies are already validated+normalised by validate(schema), and
// thrown errors are rendered by the global error handler. No try/catch here.

const register = asyncHandler(async (req, res) => {
  const user = await authService.registerPartner(req.body);

  res.status(201).json({
    message: 'Registration successful. Check your email for the 6-digit OTP to verify your account.',
    user,
  });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyOtp(email, otp);

  res.status(200).json({ message: 'Account verified successfully.', ...result });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);

  res.status(200).json({ message: 'Login successful.', ...result });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body.email);

  res.status(200).json(result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const result = await authService.resetPassword(email, otp, newPassword);

  res.status(200).json(result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);

  res.status(200).json({ user });
});

module.exports = { register, verifyOtp, login, forgotPassword, resetPassword, me };
