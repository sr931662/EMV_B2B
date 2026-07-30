import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, Button, Input, PasswordStrengthMeter } from '../../components/ui';
import { apiPost, ApiError } from '../../api/client';
import { EMAIL_RE, MOBILE_RE, PINCODE_RE, isPasswordValid } from '../../lib/validators';

const INITIAL_FORM = {
  companyName: '',
  gstNumber: '',
  panNumber: '',
  website: '',
  ownerName: '',
  businessEmail: '',
  mobile: '',
  officeAddress: '',
  city: '',
  state: '',
  country: '',
  pincode: '',
  password: '',
  confirmPassword: '',
};

function SectionHeading({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</h2>
  );
}

function validateForm(form) {
  const errors = {};

  if (!form.companyName.trim()) errors.companyName = 'Company name is required';
  if (!form.gstNumber.trim()) errors.gstNumber = 'GST number is required';
  else if (form.gstNumber.trim().length > 20) errors.gstNumber = 'GST number is too long';
  if (form.panNumber.trim().length > 20) errors.panNumber = 'PAN number is too long';

  if (!form.ownerName.trim()) errors.ownerName = 'Owner name is required';
  if (!form.businessEmail.trim()) errors.businessEmail = 'Business email is required';
  else if (!EMAIL_RE.test(form.businessEmail.trim())) errors.businessEmail = 'Enter a valid email address';
  if (!form.mobile.trim()) errors.mobile = 'Mobile number is required';
  else if (!MOBILE_RE.test(form.mobile.trim())) {
    errors.mobile = 'Mobile must be 7-15 digits, optionally starting with +';
  }

  if (!form.officeAddress.trim()) errors.officeAddress = 'Office address is required';
  if (!form.city.trim()) errors.city = 'City is required';
  if (!form.state.trim()) errors.state = 'State is required';
  if (!form.country.trim()) errors.country = 'Country is required';
  if (!form.pincode.trim()) errors.pincode = 'Pincode is required';
  else if (!PINCODE_RE.test(form.pincode.trim())) {
    errors.pincode = 'Pincode must be 3-12 alphanumeric characters';
  }

  if (!isPasswordValid(form.password)) {
    errors.password = 'At least 8 characters, with a letter and a number';
  }
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const email = form.businessEmail.trim().toLowerCase();
    const payload = {
      companyName: form.companyName.trim(),
      ownerName: form.ownerName.trim(),
      gstNumber: form.gstNumber.trim(),
      panNumber: form.panNumber.trim() || undefined,
      businessEmail: email,
      mobile: form.mobile.trim(),
      officeAddress: form.officeAddress.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      pincode: form.pincode.trim(),
      website: form.website.trim() || undefined,
      password: form.password,
    };

    setLoading(true);
    try {
      await apiPost('/api/auth/register', payload);
      navigate('/verify-otp', { state: { email, justRegistered: true } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const fieldErrors = {};
          err.details.forEach((d) => {
            fieldErrors[d.field] = d.message;
          });
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
        }
        setFormError(err.message);
      } else {
        setFormError('Network error. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Register your agency"
      subtitle="Create a partner account to start building quotes."
      maxWidth="max-w-2xl"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Log in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <div className="flex flex-col gap-4">
          <SectionHeading>Company info</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Company name"
              required
              value={form.companyName}
              onChange={setField('companyName')}
              error={errors.companyName}
            />
            <Input
              label="GST number"
              required
              value={form.gstNumber}
              onChange={setField('gstNumber')}
              error={errors.gstNumber}
            />
            <Input
              label="PAN number"
              value={form.panNumber}
              onChange={setField('panNumber')}
              error={errors.panNumber}
              hint="Optional"
            />
            <Input
              label="Website"
              value={form.website}
              onChange={setField('website')}
              error={errors.website}
              hint="Optional"
            />
          </div>
          <p className="text-xs text-neutral-400">
            Company logo upload isn&apos;t supported by registration yet — you&apos;ll be able to add one later.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading>Contact</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Owner name"
              required
              value={form.ownerName}
              onChange={setField('ownerName')}
              error={errors.ownerName}
            />
            <Input
              label="Business email"
              type="email"
              autoComplete="email"
              required
              value={form.businessEmail}
              onChange={setField('businessEmail')}
              error={errors.businessEmail}
              hint={!errors.businessEmail ? 'This is also your login email' : undefined}
            />
            <Input
              label="Mobile"
              required
              value={form.mobile}
              onChange={setField('mobile')}
              error={errors.mobile}
              hint={!errors.mobile ? 'e.g. +919876543210' : undefined}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading>Address</SectionHeading>
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Office address"
              required
              value={form.officeAddress}
              onChange={setField('officeAddress')}
              error={errors.officeAddress}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="City" required value={form.city} onChange={setField('city')} error={errors.city} />
            <Input label="State" required value={form.state} onChange={setField('state')} error={errors.state} />
            <Input
              label="Country"
              required
              value={form.country}
              onChange={setField('country')}
              error={errors.country}
            />
            <Input
              label="Pincode"
              required
              value={form.pincode}
              onChange={setField('pincode')}
              error={errors.pincode}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading>Security</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={setField('password')}
                error={errors.password}
                hint={!errors.password ? 'At least 8 characters, with a letter and a number' : undefined}
              />
              <div className="mt-2">
                <PasswordStrengthMeter password={form.password} />
              </div>
            </div>
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={setField('confirmPassword')}
              error={errors.confirmPassword}
            />
          </div>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export default RegisterPage;
