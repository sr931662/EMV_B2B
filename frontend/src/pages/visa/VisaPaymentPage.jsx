import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Spinner, Textarea } from '../../components/ui';
import PaymentMethodsPanel from '../../components/payments/PaymentMethodsPanel';
import ScreenshotUpload from '../../components/payments/ScreenshotUpload';
import ReadinessPanel from '../../components/visa/ReadinessPanel';
import { apiGet, apiUpload, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';

const PENDING_STATUSES = ['PAYMENT_SUBMITTED', 'PENDING_VERIFICATION'];
const CONFIRMED_STATUSES = ['PAYMENT_APPROVED', 'VISA_PROCESSING_STARTED', 'COMPLETED'];

function validate(form) {
  const errors = {};
  if (!form.transactionId.trim()) errors.transactionId = 'Transaction ID is required';
  else if (form.transactionId.trim().length < 3) {
    errors.transactionId = 'Transaction ID must be at least 3 characters';
  }
  if (form.amount === '' || Number.isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
    errors.amount = 'Enter the amount you paid';
  }
  if (!form.file) errors.screenshot = 'Upload a screenshot or PDF receipt of your payment';
  return errors;
}

function VisaPaymentPage() {
  const { id } = useParams();

  const [visaRequest, setVisaRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ transactionId: '', amount: '', notes: '', file: null });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const loadRequest = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/visa-requests/${id}`)
      .then((res) => {
        setVisaRequest(res.visaRequest);
        // The partner pays TravNexa the WHOLESALE amount only — sellingPrice includes their own
        // markup, which is their profit from their own customer and never flows to TravNexa.
        const { sellingPrice, markupAmount } = res.visaRequest.pricing;
        const amountDue = Number(sellingPrice) - Number(markupAmount);
        setForm((prev) => (prev.amount === '' ? { ...prev, amount: amountDue } : prev));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load visa request.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const formData = new FormData();
    formData.append('transactionId', form.transactionId.trim());
    formData.append('amount', form.amount);
    if (form.notes.trim()) formData.append('notes', form.notes.trim());
    formData.append('screenshot', form.file);

    setSubmitting(true);
    try {
      const res = await apiUpload(`/api/visa-requests/${id}/payment`, formData);
      setSubmitResult(res);
      await loadRequest();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  const status = visaRequest.status;
  const payment = visaRequest.latestPayment;
  const isInfoRequested = payment?.status === 'INFO_REQUESTED';
  const readiness = visaRequest.documentReadiness;
  const { sellingPrice, markupAmount } = visaRequest.pricing;
  // What the partner owes TravNexa — wholesale only, never the customer-facing sellingPrice.
  const amountDue = Number(sellingPrice) - Number(markupAmount);
  const amountMismatch =
    form.amount !== '' && !Number.isNaN(Number(form.amount)) && Number(form.amount) !== amountDue;

  const backLink = (
    <Link to={`/visa/${id}`} className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
      &larr; Back to application
    </Link>
  );

  if (status === 'REJECTED') {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Alert variant="danger">This application was rejected. No further payment can be submitted.</Alert>
      </div>
    );
  }

  // Documents not ready yet — can't pay.
  if (status === 'APPLICATION_SUBMITTED' && !readiness.readyToSubmit) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Alert variant="warning" title="Documents missing">
          Upload every mandatory document for all passengers before paying.
        </Alert>
        <ReadinessPanel readiness={readiness} />
        <Link to={`/visa/${id}`}>
          <Button variant="outline">Go to application</Button>
        </Link>
      </div>
    );
  }

  // Already submitted (or just submitted this session) and awaiting TravNexa verification.
  if ((PENDING_STATUSES.includes(status) && !isInfoRequested) || submitResult) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">Payment Submitted</h1>
        <Alert variant="success" title="Pending verification">
          {submitResult?.message ??
            'Your payment has been submitted successfully. It is currently pending verification by the TravNexa Global team. Verification usually takes 24 to 48 hours.'}
        </Alert>

        {submitResult?.reconciliation?.reconciliationMismatch && (
          <Alert variant="warning">{submitResult.reconciliation.note}</Alert>
        )}

        <Card title="Application status">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-500">Status</p>
              <Badge status={status} />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Payment approved / processing / completed.
  if (CONFIRMED_STATUSES.includes(status)) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Alert variant="success" title={status === 'COMPLETED' ? 'Visa Completed!' : 'Payment approved'}>
          {status === 'COMPLETED'
            ? 'This visa application has been completed.'
            : 'Payment has been verified and this application is being processed.'}
        </Alert>
      </div>
    );
  }

  // APPLICATION_SUBMITTED + ready, or PENDING_VERIFICATION + INFO_REQUESTED (amend) -> the form.
  return (
    <div className="flex flex-col gap-6">
      {backLink}

      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
          {payment ? 'Resubmit Payment' : 'Submit Payment'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {visaRequest.applicationNumber} — {visaRequest.visaCountry?.name}
        </p>
      </div>

      {payment?.status === 'REJECTED' && (
        <Alert variant="danger" title="Your last payment was rejected">
          {payment.adminRemarks || 'Your payment was rejected.'} Please review and resubmit below.
        </Alert>
      )}

      {isInfoRequested && (
        <Alert variant="warning" title="TravNexa requested more information">
          {payment.adminRemarks || 'TravNexa needs more information about your payment.'} Please
          amend and resubmit below.
        </Alert>
      )}

      <PaymentMethodsPanel amountDue={amountDue} />

      <Alert variant="info">
        You pay TravNexa the wholesale cost ({formatCurrency(amountDue)}). Your{' '}
        {formatCurrency(markupAmount)} markup is your profit, collected from your customer
        separately — it is not paid to TravNexa.
      </Alert>

      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {formError && <Alert variant="danger">{formError}</Alert>}

          <Input
            label="Transaction ID"
            required
            value={form.transactionId}
            onChange={(e) => setForm((prev) => ({ ...prev, transactionId: e.target.value }))}
            error={errors.transactionId}
            hint={!errors.transactionId ? 'UTR number, UPI reference, or bank transaction ID' : undefined}
          />

          <div>
            <Input
              label="Amount paid"
              type="number"
              min="0"
              required
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              error={errors.amount}
              hint={!errors.amount ? `Amount due to TravNexa: ${formatCurrency(amountDue)}` : undefined}
            />
            {amountMismatch && (
              <p className="mt-2 text-sm text-warning-600">
                This differs from the amount due to TravNexa — that&apos;s fine, but it&apos;ll be
                flagged for review.
              </p>
            )}
          </div>

          <ScreenshotUpload
            file={form.file}
            onChange={(file) => setForm((prev) => ({ ...prev, file }))}
            error={errors.screenshot}
            required
          />

          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            hint="Optional"
          />

          <Button type="submit" loading={submitting} className="w-full sm:w-auto sm:self-end">
            Submit Payment
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default VisaPaymentPage;
