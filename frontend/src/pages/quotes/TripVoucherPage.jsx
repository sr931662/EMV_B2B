import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Icon, Skeleton, Table } from '../../components/ui';
import MarkdownContent from '../../components/shared/MarkdownContent';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';

/**
 * The post-payment trip voucher — one printable page holding the trip reference, payment status,
 * day-wise itinerary, travellers, documents and terms.
 *
 * Everything comes from a single /voucher call. The server assembles it because the same figures
 * appear in several places on the page (totals, per-hotel dates, ages), and recomputing them in the
 * browser would be a second implementation of rules that decide what a customer owes.
 */

const TRAVELLER_TYPE_LABELS = { ADULT: 'Adult', CHILD: 'Child', INFANT: 'Infant' };

const PAYMENT_STATUS_TONE = {
  APPROVED: 'success',
  PENDING_VERIFICATION: 'warning',
  INFO_REQUESTED: 'warning',
  REJECTED: 'danger',
};

/** Date + weekday, the way the voucher prints it: "05 Nov 2026 (Thursday)". */
function DateWithDay({ value }) {
  if (!value) return <span className="text-neutral-400">—</span>;

  return (
    <span>
      {formatDate(value.date)} <span className="text-neutral-500">({value.day})</span>
    </span>
  );
}

function Section({ title, children, actions }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-[14px] text-neutral-900">{children}</p>
    </div>
  );
}

function TripVoucherPage() {
  const { id } = useParams();
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiGet(`/api/quotes/${id}/voucher`)
      .then((res) => {
        if (!cancelled) setVoucher(res.voucher);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load this trip.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Skeleton.Stat />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!voucher) return null;

  const { trip, payment, itinerary, travellers, documents, notes } = voucher;
  const namesMissing = trip.guests.total - travellers.length;

  return (
    <div className="flex flex-col gap-8">
      {/* print:hidden — the navigation and the print button itself have no place on paper. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={`/quotes/${id}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
        >
          <Icon name="arrow-left" size={14} />
          Back to quote
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Icon name="file" size={15} />
          Print invoice
        </Button>
      </div>

      {/* 1. Trip reference — top left, with the status, exactly as the brief asks. */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Trip reference</p>
            <p className="font-mono text-[18px] font-semibold text-neutral-900">
              {trip.quoteNumber}
            </p>
            <div className="mt-2">
              <Badge status={trip.status} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Requested</p>
            <p className="text-[14px] text-neutral-900">{formatDate(trip.submittedAt)}</p>
            {trip.agency && <p className="text-[13px] text-neutral-500">{trip.agency}</p>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-4">
          <Field label="Guest name">{trip.guestName}</Field>
          <Field label="Travel date">
            <DateWithDay value={trip.travelDate} />
          </Field>
          <Field label="Total guests">
            {trip.guests.total}
            <span className="ml-1 text-[13px] text-neutral-500">
              ({trip.guests.adults} adult{trip.guests.adults === 1 ? '' : 's'}
              {trip.guests.children > 0 && `, ${trip.guests.children} child`}
              {trip.guests.infants > 0 && `, ${trip.guests.infants} infant`})
            </span>
          </Field>
          <Field label="Contact">{trip.contactNumber}</Field>
        </div>

        {trip.specialRequests && (
          <div className="mt-4 rounded-lg bg-neutral-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Special requests</p>
            <p className="mt-1 text-[13px] text-neutral-700">{trip.specialRequests}</p>
          </div>
        )}
      </Card>

      {/* 2. Payment details */}
      <Section title="Payment details">
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Total price">{formatCurrency(payment.sellingPrice)}</Field>
            <Field label={`TCS (${payment.tcsRate}%)`}>{formatCurrency(payment.tcsAmount)}</Field>
            <Field label="Amount inclusive of TCS">
              <strong>{formatCurrency(payment.totalPayable)}</strong>
            </Field>
            <Field label="Total received">{formatCurrency(payment.totalReceived)}</Field>
          </div>

          {Number(payment.balanceDue) > 0 && (
            <Alert variant="warning" className="mt-4">
              Balance due: <strong>{formatCurrency(payment.balanceDue)}</strong>
            </Alert>
          )}

          {Number(payment.tcsRate) === 0 && (
            // Loud on purpose: a 0% TCS line on a real invoice almost always means the rate was
            // never configured, not that the trip is genuinely untaxed.
            <Alert variant="info" className="mt-4 print:hidden">
              TCS is set to 0%. If that is not intentional, an admin needs to set the rate in
              settings — it is frozen onto each quote when the quote is created, so changing it
              later will not affect trips already quoted.
            </Alert>
          )}

          <div className="mt-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Payment timeline</p>
            {payment.timeline.length === 0 ? (
              <p className="text-[13px] text-neutral-500">No payments submitted yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {payment.timeline.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 border-l-2 border-neutral-200 pl-3">
                    <Badge variant={PAYMENT_STATUS_TONE[p.status] ?? 'neutral'}>
                      {p.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                    <span className="text-[14px] font-medium text-neutral-900">
                      {formatCurrency(p.amount)}
                    </span>
                    <span className="text-[13px] text-neutral-500">
                      submitted {formatDate(p.submittedAt)}
                      {p.verifiedAt && ` · verified ${formatDate(p.verifiedAt)}`}
                    </span>
                    <span className="font-mono text-[12px] text-neutral-400">{p.transactionId}</span>
                    {p.reconciliationMismatch && <Badge variant="warning">amount mismatch</Badge>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </Section>

      {/* 3. Full quote details, day wise */}
      <Section title="Trip details">
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Country">{itinerary.countryName}</Field>
            <Field label="Package">{itinerary.packageTitle}</Field>
            <Field label="Total nights">{itinerary.totalNights}</Field>
            <Field label="Trip dates">
              <DateWithDay value={itinerary.tripStart} /> → <DateWithDay value={itinerary.tripEnd} />
            </Field>
          </div>
        </Card>

        {itinerary.stays.length > 0 && (
          <Card title="Stay information" bodyClassName="p-0">
            <Table minWidth="46rem">
              <Table.Head>
                <Table.HeadCell>Hotel</Table.HeadCell>
                <Table.HeadCell>Address</Table.HeadCell>
                <Table.HeadCell align="right">Nights</Table.HeadCell>
                <Table.HeadCell>Check in</Table.HeadCell>
                <Table.HeadCell>Check out</Table.HeadCell>
              </Table.Head>
              <Table.Body>
                {itinerary.stays.map((s) => (
                  <Table.Row key={s.id}>
                    <Table.Cell strong>
                      {s.hotelName}
                      <span className="ml-2 text-[12px] text-neutral-500">{s.hotelCategory}</span>
                    </Table.Cell>
                    <Table.Cell muted={!s.hotelAddress}>{s.hotelAddress ?? 'Address not added'}</Table.Cell>
                    <Table.Cell align="right">{s.nights}</Table.Cell>
                    <Table.Cell>
                      <DateWithDay value={s.checkIn} />
                    </Table.Cell>
                    <Table.Cell>
                      <DateWithDay value={s.checkOut} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Card>
        )}

        <Card title="Itinerary">
          {itinerary.dayWise.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No day-wise itinerary on this package.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {itinerary.dayWise.map((d) => (
                <li key={d.dayNumber} className="border-l-2 border-primary-200 pl-4">
                  <p className="text-[12px] uppercase tracking-wide text-primary-700">
                    Day {d.dayNumber} · <DateWithDay value={{ date: d.date, day: d.day }} />
                  </p>
                  <p className="mt-0.5 text-[15px] font-medium text-neutral-900">{d.title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-neutral-600">{d.description}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Inclusions">
            <MarkdownContent content={itinerary.inclusions} />
          </Card>
          <Card title="Exclusions">
            <MarkdownContent content={itinerary.exclusions} />
          </Card>
        </div>
      </Section>

      {/* 4. Traveller details */}
      <Section
        title="Traveller details"
        actions={
          <Button as={Link} to={`/quotes/${id}/travellers`} variant="outline" size="sm" className="print:hidden">
            Edit travellers
          </Button>
        }
      >
        <Card bodyClassName={travellers.length ? 'p-0' : undefined}>
          {travellers.length === 0 ? (
            <p className="text-[13px] text-neutral-500">
              No traveller names added yet. The trip is priced for {trip.guests.total} guest
              {trip.guests.total === 1 ? '' : 's'}.
            </p>
          ) : (
            <>
              <Table minWidth="30rem">
                <Table.Head>
                  <Table.HeadCell>Name</Table.HeadCell>
                  <Table.HeadCell>Type</Table.HeadCell>
                  <Table.HeadCell align="right">Age on travel date</Table.HeadCell>
                </Table.Head>
                <Table.Body>
                  {travellers.map((t) => (
                    <Table.Row key={t.id}>
                      <Table.Cell strong>{t.fullName}</Table.Cell>
                      <Table.Cell>{TRAVELLER_TYPE_LABELS[t.type] ?? t.type}</Table.Cell>
                      <Table.Cell align="right">{t.age}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
              {namesMissing > 0 && (
                // Surfaced rather than blocked: names arrive after pricing, so a gap is normal
                // mid-booking — but it must not go unnoticed before the voucher is sent to a hotel.
                <div className="p-4 print:hidden">
                  <Alert variant="warning">
                    {namesMissing} traveller name{namesMissing === 1 ? '' : 's'} still missing — the
                    trip is priced for {trip.guests.total}.
                  </Alert>
                </div>
              )}
            </>
          )}
        </Card>
      </Section>

      {/* 5. Trip documents */}
      <Section title="Trip documents">
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Voucher ID">
              {documents.voucherNumber ?? (
                <span className="text-neutral-400">Issued once the booking is confirmed</span>
              )}
            </Field>
            <Field label="Itinerary ID">
              {documents.itineraryNumber ?? (
                <span className="text-neutral-400">Issued once the booking is confirmed</span>
              )}
            </Field>
            <Field label="Quote PDF">
              {documents.quotePdfPath ? (
                <Link to={`/quotes/${id}`} className="text-primary-600 hover:text-primary-700">
                  Download from the quote
                </Link>
              ) : (
                <span className="text-neutral-400">Not generated</span>
              )}
            </Field>
          </div>
        </Card>
      </Section>

      {/* 6. Notes and terms */}
      <Section title="Important notes and terms">
        <div className="flex flex-col gap-4">
          {notes.countryGeneralNotes && (
            <Card title={`${notes.countryName} — general notes`}>
              <MarkdownContent content={notes.countryGeneralNotes} />
            </Card>
          )}
          {notes.toursAndTransfers && (
            <Card title={`${notes.countryName} — tours and transfers`}>
              <MarkdownContent content={notes.toursAndTransfers} />
            </Card>
          )}
          {notes.terms.map((block) => (
            <Card key={block.name} title={block.title}>
              <MarkdownContent content={block.body} />
            </Card>
          ))}
          {!notes.countryGeneralNotes && !notes.toursAndTransfers && notes.terms.length === 0 && (
            <Card>
              <p className="text-[13px] text-neutral-500">
                No notes or terms configured yet. An admin adds country notes on the destination and
                the standard terms under content settings.
              </p>
            </Card>
          )}
        </div>
      </Section>
    </div>
  );
}

export default TripVoucherPage;
