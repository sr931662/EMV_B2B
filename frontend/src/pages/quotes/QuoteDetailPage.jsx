import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import QuoteForm from '../../components/quotes/QuoteForm';
import QuoteStepper from '../../components/quotes/QuoteStepper';
import PricingBreakdown from '../../components/quotes/PricingBreakdown';
import { apiGet, apiPatch, apiPost, apiDownload, ApiError } from '../../api/client';
import MarkdownContent from '../../components/shared/MarkdownContent';
import { formatCurrency, formatDate, formatDateTime, splitTextBlock } from '../../lib/format';
import { quotePdfFilename } from '../../lib/quotePdf';

const BRANDING_LABEL = { OWN: 'My Company Branding (white-label)', EMV: 'TravNexa Branding' };

function ConfirmationPanel({ quote, payment }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card bodyClassName="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-success-700">
            Trip Confirmation
          </p>
          <h2 className="mt-2 text-xl font-semibold text-neutral-900">{quote.package?.title}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {quote.package?.destination?.name} &middot; {quote.package?.days} days /{' '}
            {quote.package?.nights} nights
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-neutral-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Trip Reference
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{quote.id}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Travel Date
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{formatDate(quote.travelDate)}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Travellers
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">
              {quote.adults + quote.children + quote.infants} guest
              {quote.adults + quote.children + quote.infants === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <Alert variant="info">
          Keep passport details, PAN details and the mandatory trip documents ready so operations can
          move faster after payment verification.
        </Alert>
      </Card>

      <Card bodyClassName="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
          Payment Details
        </p>
        <div>
          <p className="text-[28px] font-semibold tracking-tight text-neutral-900">
            {formatCurrency(payment?.amount ?? quote.sellingPrice)}
          </p>
          <p className="mt-1 text-sm text-neutral-500">Verified booking amount</p>
        </div>
        {payment && (
          <>
            <div className="rounded-xl border border-neutral-200 px-4 py-3 text-sm">
              <p className="text-neutral-500">Transaction ID</p>
              <p className="mt-1 font-medium text-neutral-900">{payment.transactionId}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 px-4 py-3 text-sm">
              <p className="text-neutral-500">Submitted</p>
              <p className="mt-1 font-medium text-neutral-900">{formatDateTime(payment.createdAt)}</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function DestinationSection({ title, content }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900">{title}</h2>
      <MarkdownContent content={content} />
    </Card>
  );
}

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
  const isConfirmed = quote.status === 'BOOKING_CONFIRMED' || quote.status === 'ORDER_COMPLETED';

  return (
    <div className="flex flex-col gap-6">
      <Link to="/quotes" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to my quotes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">{quote.package?.title}</h1>
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

      {isConfirmed && <ConfirmationPanel quote={quote} payment={payment} />}

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

          {isConfirmed && (
            <>
              <Card title="Booked itinerary">
                <div className="flex flex-col gap-5">
                  {quote.package?.packageDays?.map((day) => (
                    <div key={day.id} className="rounded-xl border border-neutral-200 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
                          {day.dayNumber}
                        </span>
                        <div>
                          <h3 className="font-semibold text-neutral-900">{day.title}</h3>
                          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-neutral-600">
                            {day.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {quote.package?.packageHotels?.length > 0 && (
                <Card title="Accommodation">
                  <div className="grid gap-4 md:grid-cols-2">
                    {quote.package.packageHotels.map((hotel) => (
                      <div key={hotel.id} className="rounded-xl border border-neutral-200 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-neutral-900">{hotel.hotelName}</h3>
                          <Badge variant="info">{hotel.hotelCategory}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-600">
                          {hotel.hotelDescription}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Traveller details">
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-neutral-500">Lead traveller</dt>
                    <dd className="text-neutral-900">{quote.leadName}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Contact number</dt>
                    <dd className="text-neutral-900">{quote.contactNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Email</dt>
                    <dd className="text-neutral-900">{quote.email}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Traveller mix</dt>
                    <dd className="text-neutral-900">
                      {quote.adults} adult{quote.adults === 1 ? '' : 's'}
                      {quote.children > 0 && `, ${quote.children} child${quote.children === 1 ? '' : 'ren'}`}
                      {quote.infants > 0 && `, ${quote.infants} infant${quote.infants === 1 ? '' : 's'}`}
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card title="Trip documents">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-neutral-600">
                    Download the latest confirmed quote PDF and keep it with your trip records.
                  </p>
                  <Button variant="outline" loading={downloading} onClick={handleDownload}>
                    Download Trip PDF
                  </Button>
                </div>
              </Card>

              <Card title="Important notes and terms">
                <div className="grid gap-8 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                      Inclusions
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2 text-sm text-neutral-700">
                      {splitTextBlock(quote.package?.inclusions).map((item, index) => (
                        <li key={`${item}-${index}`} className="flex gap-2">
                          <span className="mt-1 text-success-600">-</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                      Exclusions
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2 text-sm text-neutral-700">
                      {splitTextBlock(quote.package?.exclusions).map((item, index) => (
                        <li key={`${item}-${index}`} className="flex gap-2">
                          <span className="mt-1 text-danger-500">-</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>

              <DestinationSection
                title="About Destination"
                content={quote.package?.destination?.aboutDestination}
              />
              <DestinationSection title="Packages" content={quote.package?.destination?.packages} />
              <DestinationSection title="FAQs" content={quote.package?.destination?.faqs} />
            </>
          )}

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
