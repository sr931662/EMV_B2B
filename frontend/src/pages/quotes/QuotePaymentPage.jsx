import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Spinner, Textarea } from '../../components/ui';
import PaymentMethodsPanel from '../../components/payments/PaymentMethodsPanel';
import ScreenshotUpload from '../../components/payments/ScreenshotUpload';
import { apiGet, apiUpload, apiDownload, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';
import { quotePdfFilename } from '../../lib/quotePdf';

const PENDING_STATUSES = ['PAYMENT_SUBMITTED', 'PENDING_VERIFICATION'];
const CONFIRMED_STATUSES = ['BOOKING_CONFIRMED', 'ORDER_COMPLETED'];

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

function QuotePaymentPage() {
  const { id } = useParams();

  const [quote, setQuote] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const [form, setForm] = useState({ transactionId: '', amount: '', notes: '', file: null });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const loadQuote = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/quotes/${id}`)
      .then((res) => {
        setQuote(res.quote);
        setPricing(res.pricing);
        // The partner pays TravNexa the WHOLESALE amount only — sellingPrice includes their own
        // markup, which is their profit from their own customer and never flows to TravNexa.
        const amountDue = Number(res.pricing.sellingPrice) - Number(res.pricing.markupAmount);
        setForm((prev) => (prev.amount === '' ? { ...prev, amount: amountDue } : prev));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quote.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await apiDownload(`/api/quotes/${id}/quote.pdf`, { filename: quotePdfFilename(quote) });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not download the PDF.');
    } finally {
      setDownloading(false);
    }
  };

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
      const res = await apiUpload(`/api/quotes/${id}/payment`, formData);
      setSubmitResult(res);
      await loadQuote();
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

  const status = quote.status;
  const payment = quote.latestPayment;
  const isInfoRequested = payment?.status === 'INFO_REQUESTED';
  // What the partner owes TravNexa — wholesale only, never the customer-facing sellingPrice.
  const amountDue = Number(pricing.sellingPrice) - Number(pricing.markupAmount);
  const amountMismatch =
    form.amount !== '' && !Number.isNaN(Number(form.amount)) && Number(form.amount) !== amountDue;

  const backLink = (
    <Link to={`/quotes/${id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700">
      &larr; Back to quote
    </Link>
  );

  // Quote not yet approved by the customer — payment isn't accepted yet.
  if (status === 'QUOTE_GENERATED') {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Alert variant="warning" title="Confirm customer approval first">
          This quote hasn&apos;t been approved by the customer yet. Confirm approval on the quote
          page before submitting payment.
        </Alert>
        <Link to={`/quotes/${id}`}>
          <Button variant="outline">Go to quote</Button>
        </Link>
      </div>
    );
  }

  // Already submitted (or just submitted this session) and awaiting TravNexa verification. Not
  // shown when TravNexa has requested more info — that state keeps the form open so the partner
  // can amend.
  if ((PENDING_STATUSES.includes(status) && !isInfoRequested) || submitResult) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <h1 className="text-2xl font-semibold text-neutral-900">Payment Submitted</h1>

        <Alert variant="success" title="Pending verification">
          {submitResult?.message ??
            'Your payment has been submitted successfully. It is currently pending verification by the TravNexa Global team. Verification usually takes 24 to 48 hours.'}
        </Alert>

        {submitResult?.reconciliation?.reconciliationMismatch && (
          <Alert variant="warning">{submitResult.reconciliation.note}</Alert>
        )}

        <Card title="Payment status">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-500">Quote status</p>
              <Badge status={status} />
            </div>
            <p className="text-sm text-neutral-500">
              Your quote PDF stays available to download while your payment is being verified.
            </p>
          </div>
        </Card>

        <div>
          <Button variant="outline" loading={downloading} onClick={handleDownload}>
            Download Quote PDF
          </Button>
        </div>
      </div>
    );
  }

  // Payment verified and the booking is confirmed.
  if (CONFIRMED_STATUSES.includes(status)) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Alert variant="success" title="Booking Confirmed!">
          Payment has been verified and this booking is confirmed.
        </Alert>
        <div>
          <Button variant="outline" loading={downloading} onClick={handleDownload}>
            Download Quote PDF
          </Button>
        </div>
      </div>
    );
  }

  // status === 'CUSTOMER_APPROVED' (fresh, or resubmitting after a rejected payment), or
  // PENDING_VERIFICATION with an INFO_REQUESTED payment (amending) -> the form.
  return (
    <div className="flex flex-col gap-6">
      {backLink}

      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {payment ? 'Resubmit Payment' : 'Submit Payment'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {quote.package?.title} — Prepared for: {quote.leadName}
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
        {formatCurrency(pricing.markupAmount)} markup is your profit, collected from your customer
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

export default QuotePaymentPage;
