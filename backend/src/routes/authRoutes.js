const express = require('express');

const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  registerPartnerSchema,
  verifyOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../utils/authSchemas');

const router = express.Router();

// Public
router.post('/register', validate(registerPartnerSchema), authController.register);
router.post('/verify-otp', validate(verifyOtpSchema), authController.verifyOtp);
router.post('/login', validate(loginSchema), authController.login);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Authenticated
router.get('/me', authMiddleware, authController.me);

module.exports = router;
