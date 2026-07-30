import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, Button, Input } from '../../components/ui';
import { apiPost, ApiError } from '../../api/client';
import { isEmailValid } from '../../lib/validators';

function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFieldError('Email is required');
      return;
    }
    if (!isEmailValid(email)) {
      setFieldError('Enter a valid email address');
      return;
    }
    setFieldError(null);

    setLoading(true);
    try {
      await apiPost('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        footer={
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Back to login
          </Link>
        }
      >
        <Alert variant="success">
          If that email exists in our system, we&apos;ve sent a 6-digit reset code to it.
        </Alert>
        <Button
          className="mt-4 w-full"
          onClick={() => navigate('/reset-password', { state: { email: email.trim().toLowerCase() } })}
        >
          I have my code
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your account email and we'll send you a reset code."
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
          error={fieldError}
        />
        <Button type="submit" loading={loading} className="w-full">
          Send reset code
        </Button>
      </form>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
