import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, Button, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { apiPost, ApiError } from '../../api/client';
import { roleHome } from '../../lib/roleHome';
import { isEmailValid } from '../../lib/validators';

const UNVERIFIED_MESSAGE = 'Please verify your account first';
const SUSPENDED_MESSAGE = 'This account has been deactivated';

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errors = {};
    if (!email.trim()) errors.email = 'Email is required';
    else if (!isEmailValid(email)) errors.email = 'Enter a valid email address';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setNeedsVerification(false);
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await apiPost('/api/auth/login', { email: email.trim().toLowerCase(), password });
      login(data.token, data.user);
      navigate(roleHome(data.user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403 && err.message === UNVERIFIED_MESSAGE) {
          setNeedsVerification(true);
        } else if (err.status === 403 && err.message === SUSPENDED_MESSAGE) {
          setFormError('This account has been suspended. Contact TravNexa Global support for help.');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Network error. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back to your partner account."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
            Register your agency
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {needsVerification && (
          <Alert variant="warning" title="Verify your account">
            Your account isn&apos;t verified yet.{' '}
            <Link
              to="/verify-otp"
              state={{ email: email.trim().toLowerCase() }}
              className="font-medium underline"
            >
              Enter your OTP to verify it
            </Link>
            .
          </Alert>
        )}
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />

        <div className="text-right text-sm">
          <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-700">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}

export default LoginPage;
