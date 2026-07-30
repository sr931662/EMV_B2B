import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import QuoteForm from '../../components/quotes/QuoteForm';
import QuoteStepper from '../../components/quotes/QuoteStepper';
import PricingBreakdown from '../../components/quotes/PricingBreakdown';
import { apiGet, apiPatch, apiPost, apiDownload, ApiError } from '../../api/client';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/format';
import { quotePdfFilename } from '../../lib/quotePdf';

const BRANDING_LABEL = { OWN: 'My Company Branding (white-label)', EMV: 'TravNexa Branding' };

function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [quote, setQuote] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadQuote = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/quotes/${id}`)
      .then((res) => {
        setQuote(res.quote);
        setPricing(res.pricing);
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
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not download the PDF.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmCustomer = async () => {
    setConfirming(true);
    try {
      await apiPost(`/api/quotes/${id}/confirm-customer`);
      await loadQuote();
      showToast({ variant: 'success', message: 'Customer approval recorded.' });
    } catch (err) {
      showToast({
        variant: 'danger',
        message: err instanceof ApiError ? err.message : 'Could not confirm the customer.',
      });
    } finally {
      setConfirming(false);
    }
  };

  const handleEditSubmit = async (payload) => {
    await apiPatch(`/api/quotes/${id}`, payload);
    setEditing(false);
    await loadQuote();
    showToast({ variant: 'success', message: 'Quote updated.' });
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

  const isEditable = quote.status === 'QUOTE_GENERATED';
  const isRejected = quote.status === 'REJECTED';
  const payment = quote.latestPayment;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/quotes" className="text-sm font-medium text-primary-600 hover:text-primary-700">
        &larr; Back to my quotes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{quote.package?.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">Prepared for: {quote.leadName}</p>
        </div>
        <Badge status={quote.status} />
      </div>

      <Card>
        {isRejected ? (
          <Alert variant="danger">This quote was rejected.</Alert>
        ) : (
          <QuoteStepper status={quote.status} />
        )}
      </Card>

      {payment?.status === 'REJECTED' && (
        <Alert variant="danger" title="Payment rejected">
          <p>{payment.adminRemarks || 'Your payment was rejected.'} Please resubmit your payment.</p>
          <Button size="sm" className="mt-3" onClick={() => navigate(`/quotes/${id}/payment`)}>
            Resubmit Payment
          </Button>
        </Alert>
      )}

      {payment?.status === 'INFO_REQUESTED' && (
        <Alert variant="warning" title="More information requested">
          <p>{payment.adminRemarks || 'TravNexa needs more information about your payment.'}</p>
          <Button size="sm" className="mt-3" onClick={() => navigate(`/quotes/${id}/payment`)}>
            Amend &amp; Resubmit
          </Button>
        </Alert>
      )}

      {payment?.status === 'PENDING_VERIFICATION' && quote.status === 'PENDING_VERIFICATION' && (
        <Alert variant="warning" title="Awaiting TravNexa verification">
          Your payment has been submitted and is awaiting verification by the TravNexa Global
          team — this usually takes 24 to 48 hours. Your quote PDF stays available to download
          in the meantime.
        </Alert>
      )}

      {(quote.status === 'BOOKING_CONFIRMED' || quote.status === 'ORDER_COMPLETED') && (
        <Alert variant="success" title="Booking Confirmed!">
          Payment has been verified and this booking is confirmed.
          {quote.status === 'ORDER_COMPLETED' ? ' The order has been marked complete.' : ''}
        </Alert>
      )}

      {payment && (
        <Card title="Payment">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Amount paid</dt>
              <dd className="text-neutral-900">{formatCurrency(payment.amount)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Transaction ID</dt>
              <dd className="text-neutral-900">{payment.transactionId}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Submitted</dt>
              <dd className="text-neutral-900">{formatDateTime(payment.createdAt)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {pricing.rawPriceChangedSinceQuote && (
        <Alert variant="info">
          TravNexa has repriced this package since your quote; your quote price is locked at the original.
        </Alert>
      )}

      <PricingBreakdown
        rawPriceAtQuote={pricing.rawPriceAtQuote}
        markupAmount={pricing.markupAmount}
        sellingPrice={pricing.sellingPrice}
      />

      {editing ? (
        <Card title="Edit quote">
          <QuoteForm
            pkg={{ ...quote.package, rawPrice: quote.rawPriceAtQuote }}
            initialValues={{
              leadName: quote.leadName,
              contactNumber: quote.contactNumber,
              email: quote.email,
              travelDate: quote.travelDate.slice(0, 10),
              adults: quote.adults,
              children: quote.children,
              infants: quote.infants,
              specialRequests: quote.specialRequests ?? '',
              markupAmount: quote.markupAmount,
              branding: quote.branding,
            }}
            submitLabel="Save changes"
            onSubmit={handleEditSubmit}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-3 text-sm font-medium text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
        </Card>
      ) : (
        <>
          <Card title="Trip details">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Contact number</dt>
                <dd className="text-neutral-900">{quote.contactNumber}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Email</dt>
                <dd className="text-neutral-900">{quote.email}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Travel date</dt>
                <dd className="text-neutral-900">{formatDate(quote.travelDate)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Travellers</dt>
                <dd className="text-neutral-900">
                  {quote.adults} adult{quote.adults === 1 ? '' : 's'}
                  {quote.children > 0 && `, ${quote.children} child${quote.children === 1 ? '' : 'ren'}`}
                  {quote.infants > 0 && `, ${quote.infants} infant${quote.infants === 1 ? '' : 's'}`}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Branding</dt>
                <dd className="text-neutral-900">{BRANDING_LABEL[quote.branding]}</dd>
              </div>
              {quote.specialRequests && (
                <div className="sm:col-span-2">
                  <dt className="text-neutral-500">Special requests</dt>
                  <dd className="whitespace-pre-line text-neutral-900">{quote.specialRequests}</dd>
                </div>
              )}
            </dl>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" loading={downloading} onClick={handleDownload}>
              Download Quote PDF
            </Button>

            {isEditable && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit quote
              </Button>
            )}

            {isEditable && (
              <Button loading={confirming} onClick={handleConfirmCustomer}>
                Customer Approved — Proceed to Booking
              </Button>
            )}

            {quote.status === 'CUSTOMER_APPROVED' && payment?.status !== 'REJECTED' && (
              <Button onClick={() => navigate(`/quotes/${id}/payment`)}>Proceed to Payment</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default QuoteDetailPage;
