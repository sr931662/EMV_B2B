import { useState } from 'react';
import { Alert, Button, Input, Textarea } from '../ui';
import BrandingChoice from './BrandingChoice';
import PriceCalcPanel from './PriceCalcPanel';
import { ApiError } from '../../api/client';
import { CONTACT_NUMBER_RE, isEmailValid } from '../../lib/validators';

const DEFAULTS = {
  leadName: '',
  contactNumber: '',
  email: '',
  travelDate: '',
  adults: 1,
  children: 0,
  infants: 0,
  specialRequests: '',
  markupAmount: '',
  branding: 'OWN',
};

function validate(form) {
  const errors = {};

  if (!form.leadName.trim()) errors.leadName = 'Lead name is required';
  if (!form.contactNumber.trim()) errors.contactNumber = 'Contact number is required';
  else if (!CONTACT_NUMBER_RE.test(form.contactNumber.trim())) {
    errors.contactNumber = 'Enter a valid phone number (7-20 digits)';
  }
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!isEmailValid(form.email)) errors.email = 'Enter a valid email address';

  if (!form.travelDate) {
    errors.travelDate = 'Travel date is required';
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(form.travelDate) < today) errors.travelDate = 'Travel date cannot be in the past';
  }

  if (form.adults === '' || Number(form.adults) < 1) errors.adults = 'At least 1 adult is required';
  if (form.children !== '' && Number(form.children) < 0) errors.children = 'Cannot be negative';
  if (form.infants !== '' && Number(form.infants) < 0) errors.infants = 'Cannot be negative';

  if (form.markupAmount === '' || Number.isNaN(Number(form.markupAmount)) || Number(form.markupAmount) < 0) {
    errors.markupAmount = 'Markup must be zero or greater';
  }

  return errors;
}

/**
 * Shared lead+pricing+branding form for both creating a quote (POST /api/quotes) and editing one
 * (PATCH /api/quotes/:id, only while QUOTE_GENERATED) — the parent page owns which request fires
 * and where to navigate on success; this component only validates, calls `onSubmit(payload)`, and
 * surfaces whatever error it throws.
 */
function QuoteForm({ pkg, initialValues, submitLabel, onSubmit }) {
  const [form, setForm] = useState(() => ({ ...DEFAULTS, ...initialValues }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const payload = {
      leadName: form.leadName.trim(),
      contactNumber: form.contactNumber.trim(),
      email: form.email.trim().toLowerCase(),
      travelDate: form.travelDate,
      adults: Number(form.adults),
      children: Number(form.children || 0),
      infants: Number(form.infants || 0),
      specialRequests: form.specialRequests.trim() || undefined,
      markupAmount: Number(form.markupAmount),
      branding: form.branding,
    };

    setLoading(true);
    try {
      await onSubmit(payload);
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
    <form className="flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
      {formError && <Alert variant="danger">{formError}</Alert>}

      <div className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Customer details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Lead name"
            required
            value={form.leadName}
            onChange={setField('leadName')}
            error={errors.leadName}
          />
          <Input
            label="Contact number"
            required
            value={form.contactNumber}
            onChange={setField('contactNumber')}
            error={errors.contactNumber}
            hint={!errors.contactNumber ? 'e.g. +91 98765 43210' : undefined}
          />
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={setField('email')}
            error={errors.email}
          />
          <Input
            label="Travel date"
            type="date"
            required
            min={today}
            value={form.travelDate}
            onChange={setField('travelDate')}
            error={errors.travelDate}
          />
          <Input
            label="Adults"
            type="number"
            min="1"
            required
            value={form.adults}
            onChange={setField('adults')}
            error={errors.adults}
          />
          <Input
            label="Children"
            type="number"
            min="0"
            value={form.children}
            onChange={setField('children')}
            error={errors.children}
            hint={!errors.children ? 'Ages 2-11' : undefined}
          />
          <Input
            label="Infants"
            type="number"
            min="0"
            value={form.infants}
            onChange={setField('infants')}
            error={errors.infants}
            hint={!errors.infants ? 'Under 2' : undefined}
          />
        </div>
        <Textarea
          label="Special requests"
          value={form.specialRequests}
          onChange={setField('specialRequests')}
          hint="Optional"
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Your price</h2>
        <Input
          label="Your markup"
          type="number"
          min="0"
          required
          value={form.markupAmount}
          onChange={setField('markupAmount')}
          error={errors.markupAmount}
          hint={!errors.markupAmount ? 'Added on top of the TravNexa cost — this is your profit.' : undefined}
        />
        <PriceCalcPanel
          adultRawPrice={pkg.adultRawPrice}
          childRawPrice={pkg.childRawPrice}
          adults={form.adults}
          childCount={form.children}
          markupAmount={form.markupAmount}
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Branding</h2>
        <BrandingChoice
          value={form.branding}
          onChange={(v) => setForm((prev) => ({ ...prev, branding: v }))}
        />
      </div>

      <Button type="submit" loading={loading} className="w-full sm:w-auto sm:self-end">
        {submitLabel}
      </Button>
    </form>
  );
}

export default QuoteForm;
