import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, Button, Input, OtpInput, PasswordStrengthMeter, useToast } from '../../components/ui';
import { apiPost, ApiError } from '../../api/client';
import { isEmailValid, isPasswordValid } from '../../lib/validators';

function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState(location.state?.email ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!isEmailValid(email)) next.email = 'Enter a valid email address';
    if (!otp.trim()) next.otp = 'Enter the 6-digit code';
    else if (!/^\d{6}$/.test(otp.trim())) next.otp = 'Code must be 6 digits';
    if (!isPasswordValid(newPassword)) {
      next.newPassword = 'At least 8 characters, with a letter and a number';
    }
    if (confirmPassword !== newPassword) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await apiPost('/api/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword,
      });
      showToast({ variant: 'success', message: 'Password reset. Please log in.' });
      navigate('/login', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Enter the code we sent you along with your new password."
      footer={
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
          Back to login
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
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

        <OtpInput label="Reset code" value={otp} onChange={setOtp} error={errors.otp} />

        <div>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={errors.newPassword}
            hint={!errors.newPassword ? 'At least 8 characters, with a letter and a number' : undefined}
          />
          <div className="mt-2">
            <PasswordStrengthMeter password={newPassword} />
          </div>
        </div>

        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />

        <Button type="submit" loading={loading} className="w-full">
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
