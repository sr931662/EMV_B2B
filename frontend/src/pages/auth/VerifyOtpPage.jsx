import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, Button, Input, OtpInput, useToast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { apiPost, ApiError } from '../../api/client';
import { roleHome } from '../../lib/roleHome';
import { isEmailValid } from '../../lib/validators';

function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState(location.state?.email ?? '');
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const justRegistered = Boolean(location.state?.justRegistered);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!isEmailValid(email)) next.email = 'Enter a valid email address';
    if (!otp.trim()) next.otp = 'Enter the 6-digit code';
    else if (!/^\d{6}$/.test(otp.trim())) next.otp = 'Code must be 6 digits';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await apiPost('/api/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });
      login(data.token, data.user);
      navigate(roleHome(data.user.role), { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim() || !isEmailValid(email)) {
      setErrors((prev) => ({ ...prev, email: 'Enter a valid email address to resend' }));
      return;
    }
    setResending(true);
    setFormError(null);
    try {
      await apiPost('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      showToast({ variant: 'success', message: 'A new code has been sent to your email.' });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Verify your account"
      subtitle="Enter the 6-digit code we emailed you."
      footer={
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
          Back to login
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {justRegistered && (
          <Alert variant="success">We sent a 6-digit OTP to your email.</Alert>
        )}
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <OtpInput label="Verification code" value={otp} onChange={setOtp} error={errors.otp} />

        <Button type="submit" loading={loading} className="w-full">
          Verify
        </Button>

        <div className="text-center text-sm text-neutral-500">
          Didn&apos;t get a code?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="font-medium text-primary-600 hover:text-primary-700 disabled:text-neutral-400"
          >
            Resend
          </button>
        </div>

        <p className="text-center text-xs text-neutral-400">
          In development, codes are also printed to the server console.
        </p>
      </form>
    </AuthLayout>
  );
}

export default VerifyOtpPage;
